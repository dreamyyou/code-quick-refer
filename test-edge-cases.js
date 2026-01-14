/**
 * 边界情况测试：检测 formatter 对不规范 HTML 的处理
 * 从实际文件中提取可能有问题的模式进行测试
 */
const fs = require('fs');

// 复制 formatter 逻辑
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

// 测试用例
const testCases = [
  {
    name: '属性中包含 > 符号',
    html: '<div onclick="if(a>b){alert(1)}">test</div>',
    expectIssue: true,
  },
  {
    name: '属性中包含 < 符号',
    html: '<div title="a < b">test</div>',
    expectIssue: false,
  },
  {
    name: 'SVG data URL 中的 > 符号',
    html: '<img src="data:image/svg+xml,%3csvg%3e%3cpath%20d=\'M0%200\'%3e%3c/path%3e%3c/svg%3e">',
    expectIssue: false,
  },
  {
    name: '未闭合的标签',
    html: '<div><span>text</div>',
    expectIssue: true,
  },
  {
    name: '多余的闭合标签',
    html: '<div>text</span></div>',
    expectIssue: true,
  },
  {
    name: '深度嵌套',
    html: '<div>'.repeat(100) + 'text' + '</div>'.repeat(100),
    expectIssue: false,
  },
  {
    name: '空属性值',
    html: '<input disabled="">',
    expectIssue: false,
  },
  {
    name: '无引号属性',
    html: '<div class=foo data-id=123>test</div>',
    expectIssue: false,
  },
  {
    name: '单引号属性',
    html: "<div class='foo' data-val='bar'>test</div>",
    expectIssue: false,
  },
  {
    name: '混合引号',
    html: `<div class="foo" data-val='bar' onclick="alert('hi')">test</div>`,
    expectIssue: false,
  },
  {
    name: '超长单行属性',
    html: `<div data-long="${'x'.repeat(10000)}">test</div>`,
    expectIssue: false,
  },
  {
    name: 'script 标签中的 HTML',
    html: '<script>var html = "<div>test</div>";</script>',
    expectIssue: false,
  },
  {
    name: 'style 标签中的 >',
    html: '<style>.foo > .bar { color: red; }</style>',
    expectIssue: false,
  },
  {
    name: 'CDATA 风格注释',
    html: '<![CDATA[<div>test</div>]]>',
    expectIssue: true, // 会被当作 doctype
  },
  {
    name: '畸形注释',
    html: '<!-- comment -- comment -->',
    expectIssue: false,
  },
  {
    name: '连续的 < 字符',
    html: '<div>a << b</div>',
    expectIssue: false,
  },
  {
    name: '自闭合非 void 元素',
    html: '<div /><span />',
    expectIssue: true,
  },
  {
    name: 'React/JSX 风格的属性',
    html: '<div className="foo" onClick={handleClick}>test</div>',
    expectIssue: false,
  },
];

// 从实际文件提取测试用例
function extractPatternsFromFile(filename) {
  if (!fs.existsSync(filename)) {
    return [];
  }

  const html = fs.readFileSync(filename, 'utf-8');
  const patterns = [];

  // 提取包含 SVG data URL 的 img 标签
  const svgImgMatch = html.match(/<img[^>]*src="data:image\/svg\+xml,[^"]*"[^>]*>/);
  if (svgImgMatch) {
    patterns.push({
      name: '实际文件: SVG data URL img',
      html: svgImgMatch[0],
      expectIssue: false,
    });
  }

  // 提取 style 属性中包含特殊字符的
  const styleMatch = html.match(/<[^>]+style="[^"]*--[^"]*"[^>]*>/);
  if (styleMatch) {
    patterns.push({
      name: '实际文件: CSS 变量 style',
      html: styleMatch[0],
      expectIssue: false,
    });
  }

  // 提取超长属性的标签
  const longAttrMatch = html.match(/<[^>]{500,}>/);
  if (longAttrMatch) {
    patterns.push({
      name: '实际文件: 超长属性标签',
      html: longAttrMatch[0].slice(0, 1000) + (longAttrMatch[0].length > 1000 ? '...(截断)' : ''),
      expectIssue: false,
    });
  }

  return patterns;
}

// 运行测试
console.log('========== HTML Formatter 边界情况测试 ==========\n');

// 添加实际文件的模式
const inputFile = process.argv[2] || 'raw-body.html';
const realPatterns = extractPatternsFromFile(inputFile);
const allCases = [...testCases, ...realPatterns];

let passed = 0;
let failed = 0;
let warnings = 0;

allCases.forEach((tc, index) => {
  process.stdout.write(`[${index + 1}/${allCases.length}] ${tc.name}... `);

  try {
    const startTime = Date.now();
    const result = formatHtml(tc.html);
    const elapsed = Date.now() - startTime;

    // 检查是否产生了合理的输出
    const hasOutput = result.length > 0;
    const hasTags = result.includes('<');

    if (elapsed > 1000) {
      console.log(`SLOW (${elapsed}ms)`);
      warnings++;
    } else if (!hasOutput && tc.html.length > 0) {
      console.log('WARN: 空输出');
      warnings++;
    } else {
      console.log(`OK (${elapsed}ms, ${result.length} chars)`);
      passed++;
    }

    // 如果预期有问题，检查输出是否合理
    if (tc.expectIssue) {
      // 简单检查：标签是否配对
      const opens = (result.match(/<[a-z][^/>]*>/gi) || []).length;
      const closes = (result.match(/<\/[a-z]+>/gi) || []).length;
      const selfCloses = (result.match(/<[a-z][^>]*\/>/gi) || []).length;

      if (Math.abs(opens - closes - selfCloses) > 1) {
        console.log(`  注意: 标签可能不配对 (开: ${opens}, 闭: ${closes}, 自闭: ${selfCloses})`);
      }
    }
  } catch (err) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
});

console.log('\n========== 测试汇总 ==========');
console.log(`通过: ${passed}`);
console.log(`警告: ${warnings}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${allCases.length}`);
