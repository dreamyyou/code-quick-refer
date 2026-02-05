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
const PRESERVE_WHITESPACE_ELEMENTS = new Set(['pre', 'code', 'textarea']);

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

  const document = editor.document;
  const selection = editor.selection;

  // 如果没有选中内容，格式化整个文件
  const range = selection.isEmpty
    ? new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
    : selection;

  const text = document.getText(range);
  const formatted = formatHtml(text);

  await editor.edit(createReplaceCallback(range, formatted));

  vscode.window.showInformationMessage('HTML formatted.');
}

function createReplaceCallback(range: vscode.Range, formatted: string): EditCallback {
  return (editBuilder: vscode.TextEditorEdit) => {
    editBuilder.replace(range, formatted);
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

      // 无法识别的 < 字符，当作文本处理并前进
      tokens.push({ type: 'text', content: '<' });
      pos++;
      continue;
    }

    // 处理普通文本
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

function escapeNewlines(text: string): string {
  return text.replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
}

function isPreserveWhitespaceElement(tag: string): boolean {
  return PRESERVE_WHITESPACE_ELEMENTS.has(tag);
}

function render(tokens: Token[]): string {
  const lines: string[] = [];
  let depth = 0;
  const tagStack: string[] = [];

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
      const contentLines = token.content.split('\n');
      // 去掉首尾空行
      while (contentLines.length > 0 && contentLines[0].trim() === '') {
        contentLines.shift();
      }
      while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === '') {
        contentLines.pop();
      }

      if (contentLines.length === 0) {
        // 空内容，单行输出
        lines.push(INDENT.repeat(depth) + startTag + `</${token.tagName}>`);
      } else if (contentLines.length === 1 && contentLines[0].trim().length < 60) {
        // 单行短内容，保持单行
        lines.push(INDENT.repeat(depth) + startTag + contentLines[0].trim() + `</${token.tagName}>`);
      } else {
        // 多行内容，保持原有相对缩进结构
        lines.push(INDENT.repeat(depth) + startTag);
        const baseIndent = INDENT.repeat(depth + 1);
        // 计算原内容的最小缩进
        let minIndent = Infinity;
        for (const line of contentLines) {
          if (line.trim().length > 0) {
            const leadingSpaces = line.match(/^(\s*)/)![1].length;
            minIndent = Math.min(minIndent, leadingSpaces);
          }
        }
        if (minIndent === Infinity) {
          minIndent = 0;
        }
        // 输出时去掉公共缩进，加上 HTML 层级缩进
        for (const line of contentLines) {
          if (line.trim().length > 0) {
            const relativeIndent = line.slice(minIndent);
            lines.push(baseIndent + relativeIndent);
          }
        }
        lines.push(INDENT.repeat(depth) + `</${token.tagName}>`);
      }
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
          const inPreserve = PRESERVE_WHITESPACE_ELEMENTS.has(token.tagName);
          const processedInline = inPreserve ? textContent : escapeNewlines(textContent);
          lines.push(INDENT.repeat(depth) + tagStr + processedInline + `</${token.tagName}>`);
          i += 2;
          continue;
        }
      }

      lines.push(INDENT.repeat(depth) + tagStr);
      tagStack.push(token.tagName);
      depth++;
      continue;
    }

    if (token.type === 'endTag') {
      depth = Math.max(0, depth - 1);
      tagStack.pop();
      lines.push(INDENT.repeat(depth) + `</${token.tagName}>`);
      continue;
    }

    if (token.type === 'text') {
      const trimmed = token.content.trim();
      if (trimmed.length > 0) {
        // 检查是否在需要保留空白的元素内
        const inPreserveElement = tagStack.some(isPreserveWhitespaceElement);
        const processedText = inPreserveElement ? trimmed : escapeNewlines(trimmed);
        lines.push(INDENT.repeat(depth) + processedText);
      }
    }
  }

  return lines.join('\n');
}
