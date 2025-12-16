# code-quick-refer

Generate “AI-friendly” code references from your current selection and copy them to clipboard.

## Usage

- Editor context menu: `Generate References`
- Command palette: `Generate References`
- Default shortcut: `alt+d` (macOS)

After running, references are copied to clipboard.

## Reference Format

```
{relative/path/to/file}:{line} [{functionOrObjectName}]
```

- `{relative/path/to/file}`: workspace-relative path
- `{line}`: 1-based line number (selection start / cursor line)
- `[{functionOrObjectName}]`: only generated for `Python (.py)`, `TypeScript/JavaScript (.ts/.tsx/.js/.jsx)`, `HTML (.html/.htm)`

### Examples

```
src/extension.ts:12 [activate]
src/references.ts:210 [MyClass.myMethod]
templates/index.html:1 [div]
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

- Multiple `def` within the selection may produce multiple lines.
- Supports:
  - top-level functions: `def foo(...):` → `foo`
  - class methods: `class A: def m(...):` → `A.m`
- If no `def` is found inside selection:
  - when selection is an identifier chain like `obj.method`, returns `obj.method`
  - otherwise falls back to the enclosing `def` at cursor (best-effort)

### HTML

- Best-effort: returns the nearest preceding opening tag name at cursor (e.g. `div`, `button`).

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

- Name detection is heuristic (especially for Python and HTML); when in doubt it still returns `{path}:{line}`.
- Only the active editor selection is used.
