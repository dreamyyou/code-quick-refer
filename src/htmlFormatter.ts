import * as vscode from 'vscode';

type EditCallback = (editBuilder: vscode.TextEditorEdit) => void;

const INDENT = '  ';
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const RAW_TEXT_ELEMENTS = new Set(['style', 'script']);

type Token =
  | { type: 'startTag'; tagName: string; attributes: string; selfClosing: boolean }
  | { type: 'endTag'; tagName: string }
  | { type: 'text'; content: string }
  | { type: 'comment'; content: string }
  | { type: 'doctype'; content: string }
  | { type: 'rawText'; tagName: string; attributes: string; content: string };

export async function formatHtmlCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor.');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showInformationMessage('Please select HTML content to format.');
    return;
  }

  const selectedText = editor.document.getText(selection);
  const formatted = formatHtml(selectedText);

  await editor.edit(createReplaceCallback(selection, formatted));

  vscode.window.showInformationMessage('HTML formatted.');
}

function createReplaceCallback(selection: vscode.Selection, formatted: string): EditCallback {
  return (editBuilder: vscode.TextEditorEdit) => {
    editBuilder.replace(selection, formatted);
  };
}

export function formatHtml(html: string): string {
  const tokens = tokenize(html);
  return render(tokens);
}

function normalizeAttributes(attrs: string): string {
  return attrs.replace(/\s+/g, ' ').trim();
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < html.length) {
    if (html.startsWith('<!--', pos)) {
      const endIndex = html.indexOf('-->', pos + 4);
      if (endIndex === -1) {
        tokens.push({ type: 'comment', content: html.slice(pos) });
        break;
      }
      tokens.push({ type: 'comment', content: html.slice(pos, endIndex + 3) });
      pos = endIndex + 3;
      continue;
    }

    if (html.startsWith('<!', pos)) {
      const endIndex = html.indexOf('>', pos);
      if (endIndex === -1) {
        tokens.push({ type: 'doctype', content: html.slice(pos) });
        break;
      }
      tokens.push({ type: 'doctype', content: html.slice(pos, endIndex + 1) });
      pos = endIndex + 1;
      continue;
    }

    if (html.startsWith('</', pos)) {
      const match = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(html.slice(pos));
      if (match) {
        tokens.push({ type: 'endTag', tagName: match[1].toLowerCase() });
        pos += match[0].length;
        continue;
      }
    }

    if (html[pos] === '<') {
      const match = /^<([A-Za-z][\w:-]*)([^>]*?)(\/?)>/.exec(html.slice(pos));
      if (match) {
        const tagName = match[1].toLowerCase();
        const attributes = normalizeAttributes(match[2]);
        const selfClosing = match[3] === '/' || VOID_ELEMENTS.has(tagName);

        if (RAW_TEXT_ELEMENTS.has(tagName) && !selfClosing) {
          const endTagPattern = new RegExp(`</${tagName}\\s*>`, 'i');
          const remaining = html.slice(pos + match[0].length);
          const endMatch = endTagPattern.exec(remaining);
          if (endMatch) {
            const rawContent = remaining.slice(0, endMatch.index);
            tokens.push({ type: 'rawText', tagName, attributes, content: rawContent });
            pos += match[0].length + endMatch.index + endMatch[0].length;
            continue;
          }
        }

        tokens.push({ type: 'startTag', tagName, attributes, selfClosing });
        pos += match[0].length;
        continue;
      }
    }

    let nextTagIndex = html.indexOf('<', pos);
    if (nextTagIndex === -1) {
      nextTagIndex = html.length;
    }
    const textContent = html.slice(pos, nextTagIndex);
    if (textContent.length > 0) {
      tokens.push({ type: 'text', content: textContent });
    }
    pos = nextTagIndex;
  }

  return tokens;
}

function render(tokens: Token[]): string {
  const lines: string[] = [];
  let depth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'doctype') {
      lines.push(token.content);
      continue;
    }

    if (token.type === 'comment') {
      lines.push(INDENT.repeat(depth) + token.content);
      continue;
    }

    if (token.type === 'rawText') {
      const startTag = token.attributes ? `<${token.tagName} ${token.attributes}>` : `<${token.tagName}>`;
      lines.push(INDENT.repeat(depth) + startTag + token.content + `</${token.tagName}>`);
      continue;
    }

    if (token.type === 'startTag') {
      const tagStr = token.attributes
        ? `<${token.tagName} ${token.attributes}${token.selfClosing ? ' /' : ''}>`
        : `<${token.tagName}${token.selfClosing ? ' /' : ''}>`;

      if (token.selfClosing) {
        lines.push(INDENT.repeat(depth) + tagStr);
        continue;
      }

      const nextToken = tokens[i + 1];
      const afterNextToken = tokens[i + 2];

      if (
        nextToken &&
        nextToken.type === 'text' &&
        afterNextToken &&
        afterNextToken.type === 'endTag' &&
        afterNextToken.tagName === token.tagName
      ) {
        const textContent = nextToken.content.trim();
        if (textContent.length > 0 && !textContent.includes('\n')) {
          lines.push(INDENT.repeat(depth) + tagStr + textContent + `</${token.tagName}>`);
          i += 2;
          continue;
        }
      }

      lines.push(INDENT.repeat(depth) + tagStr);
      depth++;
      continue;
    }

    if (token.type === 'endTag') {
      depth = Math.max(0, depth - 1);
      lines.push(INDENT.repeat(depth) + `</${token.tagName}>`);
      continue;
    }

    if (token.type === 'text') {
      const trimmed = token.content.trim();
      if (trimmed.length > 0) {
        lines.push(INDENT.repeat(depth) + trimmed);
      }
    }
  }

  return lines.join('\n');
}
