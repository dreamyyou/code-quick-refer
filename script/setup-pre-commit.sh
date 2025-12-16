#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v uv >/dev/null 2>&1 || {
  echo "uv not found. Install uv first: https://github.com/astral-sh/uv" >&2
  exit 1
}

uv sync --group dev
uv run pre-commit install
uv run pre-commit run --all-files
