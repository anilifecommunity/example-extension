#!/usr/bin/env bash
set -euo pipefail

rustup target add wasm32-wasip2
cargo build --release --target wasm32-wasip2

WASM="target/wasm32-wasip2/release/anilife_example_org_provider.wasm"
test -s "$WASM"

echo
echo "Built: $WASM"
if command -v wasm-tools >/dev/null 2>&1; then
  echo "\nComponent imports/exports:"
  wasm-tools component wit "$WASM"
else
  echo "Install wasm-tools to inspect the component: cargo install wasm-tools"
fi
