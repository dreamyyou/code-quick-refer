const fs = require('fs');

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

function normalizeAttributes(attrs) {
  return attrs.replace(/\s+/g, ' ').trim();
}

function tokenize(html) {
  const tokens = [];
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

      tokens.push({ type: 'text', content: '<' });
      pos++;
      continue;
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

function render(tokens) {
  const lines = [];
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
            const leadingSpaces = line.match(/^(\s*)/)[1].length;
            minIndent = Math.min(minIndent, leadingSpaces);
          }
        }
        if (minIndent === Infinity) minIndent = 0;
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

function formatHtml(html) {
  const tokens = tokenize(html);
  return render(tokens);
}

// 测试
const testFile =
  process.argv[2] ||
  '/Users/wikichen/navi/navi-ai/frontend_patch/visual-regression/screenshots/sidebar-min-meetings-compare_raw/newb/sidebar-min-meetings.html';

console.log('Testing file:', testFile);
console.log('---');

try {
  const html = fs.readFileSync(testFile, 'utf-8');
  console.log('Input length:', html.length);

  const startTime = Date.now();
  const result = formatHtml(html);
  const elapsed = Date.now() - startTime;

  console.log('Output length:', result.length);
  console.log('Time:', elapsed, 'ms');
  console.log('---');
  console.log('First 2000 chars of output:');
  console.log(result.slice(0, 2000));
} catch (err) {
  console.error('Error:', err.message);
}
