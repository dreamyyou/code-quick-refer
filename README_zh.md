# code-quick-refer

从当前选中的代码生成“适合编程 AI 阅读”的引用，并自动复制到剪贴板。

## 使用方法

- 编辑器右键菜单：`Generate References`
- 命令面板：`Generate References`
- 默认快捷键：macOS `alt+d`

执行后结果会自动复制到剪贴板。

## 引用格式

```
{相对路径}:{行号或范围} {函数名/对象名}
```

- `{相对路径}`：相对于当前工作区的路径
- `{行号或范围}`：从 1 开始；多行选区会输出 `起始-结束`
- `{函数名/对象名}`：仅对 `Python (.py)`、`TypeScript/JavaScript`、`HTML` 尝试识别；无法识别时省略

示例：

```
src/extension.ts:12 activate
src/references.ts:210-260 MyClass.myMethod
templates/index.html:1 div
```

## 名称识别规则（简述）

### TypeScript / JavaScript

- 选区内包含多个函数时，可能输出多行引用
- 支持：
  - `function foo() {}`
  - `const foo = () => {}` / `const foo = function () {}`
  - 类成员：`ClassName.method` / `ClassName.property`
  - 对象字面量成员（尽力而为）：`obj.method`
- 若选区内没有明确的定义，会回退到光标处的最小包裹表达式；如果是属性访问则输出 `obj.method`

### Python

- 选区内包含多个 `class`/`def` 时，可能输出多行引用
- 支持：
  - 顶层函数：`def foo(...):` → `foo`
  - 类方法：`class A: def m(...):` → `A.m`
  - 选中标识符/属性链（尽力而为）：`obj` / `obj.method` / `obj.\nmethod`
- 若选区内没有识别到名称，会依次回退到光标处的 enclosing `def`、enclosing `class`（尽力而为）

### HTML

- 尽力而为：返回光标附近最近的开始标签名（如 `div`、`button`）

## 安装与测试

### 开发调试（Extension Development Host）

```bash
pnpm install
pnpm run compile
```

在 VS Code 中按 `F5` 启动 **Extension Development Host**，然后在新窗口里：

- 打开任意项目
- 选中代码
- 右键 `Generate References`（或按 `alt+d`）
- 引用会复制到剪贴板

### 打包 VSIX（可选）

```bash
pnpm run package:vsix
```

打包出的 `.vsix` 会出现在项目根目录（例如 `code-quick-refer-0.0.3.vsix`）。

### 在 VS Code 中安装 VSIX

- 打开 VS Code
- 打开命令面板：`⇧⌘P` / `Ctrl+Shift+P`
- 执行：`Extensions: Install from VSIX...`
- 选择生成的 `.vsix` 文件并确认
- 按提示重载 VS Code

## 开发（工具链）

### 前置条件

- Node.js（推荐：22）+ `pnpm`
- Python 3.12 + `uv`

### 安装 pre-commit

```bash
pnpm install
bash script/setup-pre-commit.sh
```

### 常用命令

```bash
pnpm run lint
pnpm run check-types
pnpm run compile
pnpm run test
```
