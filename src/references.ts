import * as path from 'path';
import * as vscode from 'vscode';
import * as ts from 'typescript';

type ReferenceEntry = {
  relativePath: string;
  line: number;
  label: string | null;
};

type TsTraversalState = {
  sourceFile: ts.SourceFile;
  selectionStart: number;
  selectionEnd: number;
  focusPos: number;
  entries: ReferenceEntry[];
  enclosingCandidate: ts.Node | null;
  enclosingCandidateWidth: number;
  relativePath: string;
};

let currentTsTraversalState: TsTraversalState | null = null;

export async function generateReferencesCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor.');
    return;
  }

  const referencesText = buildReferencesText(editor);
  if (!referencesText) {
    vscode.window.showInformationMessage('No references generated.');
    return;
  }

  await vscode.env.clipboard.writeText(referencesText);
  vscode.window.showInformationMessage('References copied to clipboard.');
}

function buildReferencesText(editor: vscode.TextEditor): string | null {
  const document = editor.document;
  const selection = editor.selection;

  const relativePath = vscode.workspace.asRelativePath(document.uri, false);
  const startLine = selection.isEmpty ? selection.active.line : selection.start.line;
  const endLine = selection.isEmpty ? selection.active.line : selection.end.line;
  const selectionText = selection.isEmpty ? '' : document.getText(selection);

  const fileName = document.fileName;
  const extension = path.extname(fileName).toLowerCase();
  const fullText = document.getText();

  const selectionStart = document.offsetAt(selection.start);
  const selectionEnd = document.offsetAt(selection.end);
  const normalizedSelectionStart = Math.min(selectionStart, selectionEnd);
  const normalizedSelectionEnd = Math.max(selectionStart, selectionEnd);

  const entries: ReferenceEntry[] = [];

  if (extension === '.py') {
    addPythonEntries(entries, relativePath, fullText, selectionText, startLine, endLine, startLine);
  } else if (extension === '.ts' || extension === '.tsx' || extension === '.js' || extension === '.jsx') {
    addTypeScriptEntries(
      entries,
      relativePath,
      fullText,
      fileName,
      extension,
      normalizedSelectionStart,
      normalizedSelectionEnd,
      normalizedSelectionStart,
    );
  } else if (extension === '.html' || extension === '.htm') {
    addHtmlEntries(entries, relativePath, fullText, startLine, normalizedSelectionStart);
  }

  if (entries.length === 0) {
    entries.push({
      relativePath,
      line: startLine + 1,
      label: null,
    });
  }

  return formatEntries(entries);
}

function formatEntries(entries: ReferenceEntry[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const labelSuffix = entry.label ? ` [${entry.label}]` : '';
    const line = `${entry.relativePath}:${entry.line}${labelSuffix}`;
    if (seen.has(line)) {
      continue;
    }
    seen.add(line);
    lines.push(line);
  }

  return lines.join('\n');
}

function addHtmlEntries(
  entries: ReferenceEntry[],
  relativePath: string,
  fullText: string,
  cursorLine: number,
  focusPos: number,
) {
  const tagName = findEnclosingHtmlTagName(fullText, focusPos);
  entries.push({
    relativePath,
    line: cursorLine + 1,
    label: tagName,
  });
}

function findEnclosingHtmlTagName(fullText: string, focusPos: number): string | null {
  if (focusPos <= 0) {
    return null;
  }

  let index = Math.min(focusPos, fullText.length);
  while (index >= 0) {
    const ltIndex = fullText.lastIndexOf('<', index);
    if (ltIndex === -1) {
      return null;
    }

    const snippet = fullText.slice(ltIndex, Math.min(ltIndex + 200, fullText.length));
    if (snippet.startsWith('</') || snippet.startsWith('<!') || snippet.startsWith('<?')) {
      index = ltIndex - 1;
      continue;
    }

    const match = /^<\s*([A-Za-z][\w:-]*)/.exec(snippet);
    if (match && match[1]) {
      return match[1];
    }

    index = ltIndex - 1;
  }

  return null;
}

type PythonBlock = {
  type: 'class' | 'def';
  name: string;
  label: string;
  indent: number;
  startLine: number;
  endLine: number;
};

function addPythonEntries(
  entries: ReferenceEntry[],
  relativePath: string,
  fullText: string,
  selectionText: string,
  selectionStartLine: number,
  selectionEndLine: number,
  cursorLine: number,
) {
  const blocks = parsePythonBlocks(fullText);
  for (const block of blocks) {
    if (block.type !== 'def') {
      continue;
    }
    if (block.startLine >= selectionStartLine && block.startLine <= selectionEndLine) {
      entries.push({
        relativePath,
        line: block.startLine + 1,
        label: block.label,
      });
    }
  }

  if (entries.length > 0) {
    return;
  }

  const selectionLabel = findPythonSelectionLabel(selectionText);
  if (selectionLabel) {
    entries.push({
      relativePath,
      line: cursorLine + 1,
      label: selectionLabel,
    });
    return;
  }

  const enclosing = findEnclosingPythonDef(blocks, cursorLine);
  entries.push({
    relativePath,
    line: cursorLine + 1,
    label: enclosing ? enclosing.label : null,
  });
}

function parsePythonBlocks(fullText: string): PythonBlock[] {
  const lines = fullText.split(/\r?\n/);
  const blocks: PythonBlock[] = [];
  const stack: PythonBlock[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const indent = getPythonIndent(line);
    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
      const completed = stack.pop();
      if (completed) {
        completed.endLine = lineIndex - 1;
      }
    }

    const classMatch = /^class\s+([A-Za-z_]\w*)\b/.exec(trimmed);
    if (classMatch && classMatch[1]) {
      const className = classMatch[1];
      const block: PythonBlock = {
        type: 'class',
        name: className,
        label: className,
        indent,
        startLine: lineIndex,
        endLine: lines.length - 1,
      };
      blocks.push(block);
      stack.push(block);
      continue;
    }

    const defMatch = /^def\s+([A-Za-z_]\w*)\s*\(/.exec(trimmed);
    if (defMatch && defMatch[1]) {
      const defName = defMatch[1];
      const parentClass = findNearestPythonClass(stack);
      const label = parentClass ? `${parentClass}.${defName}` : defName;
      const block: PythonBlock = {
        type: 'def',
        name: defName,
        label,
        indent,
        startLine: lineIndex,
        endLine: lines.length - 1,
      };
      blocks.push(block);
      stack.push(block);
    }
  }

  while (stack.length > 0) {
    const completed = stack.pop();
    if (completed) {
      completed.endLine = lines.length - 1;
    }
  }

  return blocks;
}

function getPythonIndent(line: string): number {
  let indent = 0;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === ' ') {
      indent += 1;
      continue;
    }
    if (char === '\t') {
      indent += 4;
      continue;
    }
    break;
  }
  return indent;
}

function findNearestPythonClass(stack: PythonBlock[]): string | null {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].type === 'class') {
      return stack[i].name;
    }
  }
  return null;
}

function findEnclosingPythonDef(blocks: PythonBlock[], cursorLine: number): PythonBlock | null {
  let best: PythonBlock | null = null;
  let bestWidth = Number.POSITIVE_INFINITY;

  for (const block of blocks) {
    if (block.type !== 'def') {
      continue;
    }
    if (cursorLine < block.startLine || cursorLine > block.endLine) {
      continue;
    }
    const width = block.endLine - block.startLine;
    if (width < bestWidth) {
      best = block;
      bestWidth = width;
    }
  }

  return best;
}

function findPythonSelectionLabel(selectionText: string): string | null {
  const trimmed = selectionText.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const match = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)$/.exec(trimmed);
  if (!match || !match[1]) {
    return null;
  }
  return match[1];
}

function addTypeScriptEntries(
  entries: ReferenceEntry[],
  relativePath: string,
  fullText: string,
  fileName: string,
  extension: string,
  selectionStart: number,
  selectionEnd: number,
  focusPos: number,
) {
  const scriptKind = getTypeScriptScriptKind(extension);
  const sourceFile = ts.createSourceFile(fileName, fullText, ts.ScriptTarget.Latest, true, scriptKind);

  const state: TsTraversalState = {
    sourceFile,
    selectionStart,
    selectionEnd,
    focusPos,
    entries: [],
    enclosingCandidate: null,
    enclosingCandidateWidth: Number.POSITIVE_INFINITY,
    relativePath,
  };

  currentTsTraversalState = state;
  visitTsNode(sourceFile, state);
  currentTsTraversalState = null;

  for (const entry of state.entries) {
    entries.push(entry);
  }

  if (entries.length > 0) {
    return;
  }

  if (state.enclosingCandidate) {
    const label = findEnclosingTypeScriptLabel(state.enclosingCandidate, state);
    entries.push({
      relativePath,
      line: getTypeScriptLineNumber(state.enclosingCandidate, state.sourceFile),
      label,
    });
    return;
  }
}

function getTypeScriptScriptKind(extension: string): ts.ScriptKind {
  if (extension === '.tsx') {
    return ts.ScriptKind.TSX;
  }
  if (extension === '.jsx') {
    return ts.ScriptKind.JSX;
  }
  if (extension === '.js') {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function visitTsNode(node: ts.Node, state: TsTraversalState) {
  const nodeStart = node.getStart(state.sourceFile);
  const nodeEnd = node.getEnd();

  if (state.focusPos >= nodeStart && state.focusPos <= nodeEnd) {
    const width = nodeEnd - nodeStart;
    if (width < state.enclosingCandidateWidth) {
      state.enclosingCandidate = node;
      state.enclosingCandidateWidth = width;
    }
  }

  if (rangesIntersect(nodeStart, nodeEnd, state.selectionStart, state.selectionEnd)) {
    const entry = getTypeScriptEntryFromNode(node, state);
    if (entry) {
      addUniqueEntry(state.entries, entry);
    }
  }

  ts.forEachChild(node, tsForEachChildCallback);
}

function tsForEachChildCallback(child: ts.Node) {
  if (!currentTsTraversalState) {
    return;
  }
  visitTsNode(child, currentTsTraversalState);
}

function rangesIntersect(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function getTypeScriptEntryFromNode(node: ts.Node, state: TsTraversalState): ReferenceEntry | null {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return {
      relativePath: state.relativePath,
      line: getTypeScriptLineNumber(node, state.sourceFile),
      label: node.name.text,
    };
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
      return {
        relativePath: state.relativePath,
        line: getTypeScriptLineNumber(node, state.sourceFile),
        label: node.name.text,
      };
    }
  }

  if (ts.isMethodDeclaration(node)) {
    const label = getTypeScriptMemberLabel(node, state);
    if (!label) {
      return null;
    }
    return {
      relativePath: state.relativePath,
      line: getTypeScriptLineNumber(node, state.sourceFile),
      label,
    };
  }

  if (ts.isPropertyDeclaration(node)) {
    const label = getTypeScriptMemberLabel(node, state);
    if (!label) {
      return null;
    }
    return {
      relativePath: state.relativePath,
      line: getTypeScriptLineNumber(node, state.sourceFile),
      label,
    };
  }

  if (ts.isPropertyAssignment(node)) {
    const label = getTypeScriptPropertyAssignmentLabel(node, state);
    if (!label) {
      return null;
    }
    return {
      relativePath: state.relativePath,
      line: getTypeScriptLineNumber(node, state.sourceFile),
      label,
    };
  }

  return null;
}

function getTypeScriptPropertyAssignmentLabel(node: ts.PropertyAssignment, state: TsTraversalState): string | null {
  const propertyName = getTypeScriptPropertyNameText(node.name, state.sourceFile);
  if (!propertyName) {
    return null;
  }

  const parent = node.parent;
  if (!ts.isObjectLiteralExpression(parent)) {
    return propertyName;
  }

  const ownerName = getTypeScriptObjectLiteralOwnerName(parent, state.sourceFile);
  if (ownerName) {
    return `${ownerName}.${propertyName}`;
  }
  return propertyName;
}

function getTypeScriptMemberLabel(
  node: ts.MethodDeclaration | ts.PropertyDeclaration,
  state: TsTraversalState,
): string | null {
  if (!node.name) {
    return null;
  }
  const memberName = getTypeScriptPropertyNameText(node.name, state.sourceFile);
  if (!memberName) {
    return null;
  }

  const parent = node.parent;
  if (ts.isClassLike(parent)) {
    const className = parent.name ? parent.name.text : null;
    if (className) {
      return `${className}.${memberName}`;
    }
    return memberName;
  }

  if (ts.isObjectLiteralExpression(parent)) {
    const ownerName = getTypeScriptObjectLiteralOwnerName(parent, state.sourceFile);
    if (ownerName) {
      return `${ownerName}.${memberName}`;
    }
    return memberName;
  }

  return memberName;
}

function getTypeScriptPropertyNameText(name: ts.PropertyName, sourceFile: ts.SourceFile): string | null {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name)) {
    return name.text;
  }
  if (ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    return name.expression.getText(sourceFile);
  }
  return null;
}

function getTypeScriptObjectLiteralOwnerName(
  node: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
): string | null {
  const parent = node.parent;
  if (!parent) {
    return null;
  }

  if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }

  if (ts.isBinaryExpression(parent) && parent.right === node) {
    if (ts.isIdentifier(parent.left)) {
      return parent.left.text;
    }
    if (ts.isPropertyAccessExpression(parent.left)) {
      return parent.left.getText(sourceFile);
    }
  }

  return null;
}

function getTypeScriptLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  const start = node.getStart(sourceFile);
  const { line } = sourceFile.getLineAndCharacterOfPosition(start);
  return line + 1;
}

function addUniqueEntry(entries: ReferenceEntry[], entry: ReferenceEntry) {
  const key = `${entry.relativePath}:${entry.line}:${entry.label ?? ''}`;
  for (const existing of entries) {
    const existingKey = `${existing.relativePath}:${existing.line}:${existing.label ?? ''}`;
    if (existingKey === key) {
      return;
    }
  }
  entries.push(entry);
}

function findEnclosingTypeScriptLabel(node: ts.Node, state: TsTraversalState): string | null {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isPropertyAccessExpression(current)) {
      return current.getText(state.sourceFile);
    }

    const entry = getTypeScriptEntryFromNode(current, state);
    if (entry && entry.label) {
      return entry.label;
    }
    current = current.parent;
  }
  return null;
}
