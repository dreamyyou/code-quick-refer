# code-quick-refer

Generate “AI-friendly” code references from your current selection and copy them to clipboard.

- English: this README
- 简体中文：`README_zh.md`

## Usage

### Generate References

- Editor context menu: `Generate References`
- Command palette: `Generate References`
- Default shortcut: `alt+d` (macOS)

After running, references are copied to clipboard.

### Open with System Default

Right-click a file in Explorer → `Open with System Default`

Opens the file with the system's default application (macOS `open` command).

### Folder Favorites

Right-click a folder in Explorer → `Add to Activity Bar`

- 5 fixed slots in the Activity Bar for your favorite folders
- Click the folder icon to jump to that folder in Explorer
- Click the trash icon in the view title to remove from favorites

## Reference Format

```
{relative/path/to/file}:{lineOrRange} {functionOrObjectName}
```

- `{relative/path/to/file}`: workspace-relative path
- `{lineOrRange}`: 1-based line number, or `start-end` for multi-line selection
- `{functionOrObjectName}`: only generated for `Python (.py)`, `TypeScript/JavaScript (.ts/.tsx/.js/.jsx)`, `HTML (.html/.htm)`; omitted when not available

### Examples

```
src/extension.ts:12 activate
src/references.ts:210-260 MyClass.myMethod
templates/index.html:1 div
```

## How Names Are Detected

### TypeScript / JavaScript

- Multiple functions within the selection may produce multiple lines.
- Supports:
  - `function foo() {}`
  - `const foo = () => {}` / `const foo = function () {}`
  - class members: `ClassName.method` / `ClassName.property`
  - object literal members (best-effort): `obj.method`
- If the selection doesn’t include a recognizable definition, it falls back to the smallest enclosing expression at cursor; when it’s a property access, it returns `obj.method`.

### Python

- Multiple `class`/`def` within the selection may produce multiple lines.
- Supports:
  - top-level functions: `def foo(...):` → `foo`
  - class methods: `class A: def m(...):` → `A.m`
  - selected identifier / attribute chain (best-effort): `obj` / `obj.method` / `obj.\nmethod`
- If nothing is recognized inside selection, it falls back to the enclosing `def`, then enclosing `class` at cursor (best-effort).

### HTML

- Best-effort: returns the nearest preceding opening tag name at cursor (e.g. `div`, `button`).

## Install & Test

### Run Extension (Development Host)

```bash
pnpm install
pnpm run compile
```

Press `F5` in VS Code to launch **Extension Development Host**, then in the new window:

- Open any project/workspace
- Select code in an editor
- Right click `Generate References` (or press `alt+d`)
- The result is copied to clipboard

### Package VSIX (Optional)

`pnpm run package` only builds `dist/extension.js` (it does not produce a `.vsix`).

To build a `.vsix`:

```bash
pnpm run package:vsix
```

The generated `.vsix` is placed in the project root (e.g. `code-quick-refer-0.0.3.vsix`).

### Install VSIX in VS Code

- Open VS Code
- Open Command Palette: `⇧⌘P` (macOS) / `Ctrl+Shift+P` (Windows/Linux)
- Run: `Extensions: Install from VSIX...`
- Select the generated `.vsix` file and confirm
- Reload VS Code when prompted

## Development

### Prerequisites

- Node.js (recommended: 22) + `pnpm`
- Python 3.12 + `uv`

### Install & Pre-commit

```bash
pnpm install
bash script/setup-pre-commit.sh
```

### Common Commands

```bash
pnpm run lint
pnpm run check-types
pnpm run compile
pnpm run test
```

## Custom ESLint Rules

- Custom rules live in `rule/custom-rules.cjs`
- Enabled via `eslint.config.mjs` under the `custom-rules/*` namespace

## Extension Settings

None.

## Known Limitations

- Name detection is heuristic (especially for Python and HTML); when in doubt it still returns `{path}:{lineOrRange}`.
- Only the active editor selection is used.
