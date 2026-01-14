/**
 * 将大 HTML 文件拆分成多个小文件用于测试
 */
const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || 'raw-body.html';
const outputDir = process.argv[3] || 'html-test-chunks';
const chunkSize = parseInt(process.argv[4] || '10000', 10); // 默认 10KB 每块

console.log(`输入文件: ${inputFile}`);
console.log(`输出目录: ${outputDir}`);
console.log(`块大小: ${chunkSize} 字节`);

// 创建输出目录
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 读取输入文件
const html = fs.readFileSync(inputFile, 'utf-8');
console.log(`文件大小: ${html.length} 字节`);

// 按大小拆分（尽量在 > 处切割以保持标签完整性）
const chunks = [];
let start = 0;

while (start < html.length) {
  let end = Math.min(start + chunkSize, html.length);

  // 尝试在 > 处切割（向前查找）
  if (end < html.length) {
    const searchStart = Math.max(start, end - 100);
    let bestCut = end;
    for (let i = end; i >= searchStart; i--) {
      if (html[i] === '>') {
        bestCut = i + 1;
        break;
      }
    }
    end = bestCut;
  }

  chunks.push(html.slice(start, end));
  start = end;
}

console.log(`拆分成 ${chunks.length} 个块`);

// 写入文件
chunks.forEach((chunk, index) => {
  const filename = path.join(outputDir, `chunk-${String(index).padStart(3, '0')}.html`);
  fs.writeFileSync(filename, chunk);
  console.log(`  ${filename}: ${chunk.length} 字节`);
});

// 同时生成累积文件（用于渐进测试）
console.log('\n生成累积测试文件...');
let accumulated = '';
for (let i = 0; i < Math.min(chunks.length, 10); i++) {
  accumulated += chunks[i];
  const filename = path.join(outputDir, `accumulated-${String(i + 1).padStart(2, '0')}.html`);
  fs.writeFileSync(filename, accumulated);
  console.log(`  ${filename}: ${accumulated.length} 字节`);
}

console.log('\n完成!');
