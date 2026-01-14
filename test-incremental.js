/**
 * 渐进式测试 formatter，逐步增加输入大小
 * 用于发现 formatter 在何种大小/内容时会出问题
 */
const fs = require('fs');
const path = require('path');

// 复制 formatter 逻辑（从 test-formatter.js）
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

function formatHtml(html) {
  const tokens = tokenize(html);
  return render(tokens);
}

// 测试函数
function testFormat(html, label) {
  const startMem = process.memoryUsage().heapUsed;
  const startTime = Date.now();

  try {
    const result = formatHtml(html);
    const elapsed = Date.now() - startTime;
    const endMem = process.memoryUsage().heapUsed;
    const memDelta = (endMem - startMem) / 1024 / 1024;

    return {
      success: true,
      label,
      inputSize: html.length,
      outputSize: result.length,
      time: elapsed,
      memDelta: memDelta.toFixed(2) + ' MB',
    };
  } catch (err) {
    return {
      success: false,
      label,
      inputSize: html.length,
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 3).join('\n'),
    };
  }
}

// 主程序
const inputFile = process.argv[2] || 'raw-body.html';
const stepSize = parseInt(process.argv[3] || '5000', 10); // 每次增加 5KB

console.log(`输入文件: ${inputFile}`);
console.log(`步进大小: ${stepSize} 字节`);
console.log('');

const html = fs.readFileSync(inputFile, 'utf-8');
console.log(`文件总大小: ${html.length} 字节\n`);

const results = [];
let currentSize = stepSize;

// 先测试几个小步进
while (currentSize <= html.length) {
  const chunk = html.slice(0, currentSize);
  const result = testFormat(chunk, `0-${currentSize}`);
  results.push(result);

  if (result.success) {
    console.log(`[OK] ${result.label}: ${result.time}ms, 输出 ${result.outputSize} 字节, 内存 ${result.memDelta}`);
  } else {
    console.log(`[FAIL] ${result.label}: ${result.error}`);
    console.log(`  ${result.stack}`);
    break;
  }

  // 增加步进
  if (currentSize >= 50000) {
    currentSize += stepSize * 2; // 大文件时加速
  } else {
    currentSize += stepSize;
  }
}

// 最后测试完整文件
if (results[results.length - 1]?.success) {
  console.log('\n测试完整文件...');
  const fullResult = testFormat(html, 'FULL');
  results.push(fullResult);

  if (fullResult.success) {
    console.log(`[OK] 完整文件: ${fullResult.time}ms, 输出 ${fullResult.outputSize} 字节, 内存 ${fullResult.memDelta}`);
  } else {
    console.log(`[FAIL] 完整文件: ${fullResult.error}`);
    console.log(`  ${fullResult.stack}`);
  }
}

// 汇总
console.log('\n========== 测试汇总 ==========');
const passed = results.filter((r) => r.success).length;
const failed = results.filter((r) => !r.success).length;
console.log(`通过: ${passed}, 失败: ${failed}`);

if (failed > 0) {
  console.log('\n失败的测试:');
  results
    .filter((r) => !r.success)
    .forEach((r) => {
      console.log(`  - ${r.label}: ${r.error}`);
    });
}
