# AniLife Example.org WASM provider

A minimal Rust/WIT example for testing AniLife's provider HTTP host function.

## What it does

1. AniLife reads provider metadata from the `info` export.
2. The provider declares `example.org` in its host allowlist.
3. When AniLife calls `servers` for an episode, the provider sends `GET https://example.org/` through AniLife's `http` host function.
4. It logs the HTTP status and a short body preview.
5. It returns an empty server list. `example.org` is not a video stream, so this example intentionally does not return a playable source.

## Build

Or run the commands manually:

```bash
rustup target add wasm32-wasip2
cargo build --release --target wasm32-wasip2
wasm-tools component wit target/wasm32-wasip2/release/anilife_example_org_provider.wasm
```

The compiled file should be:

```text
target/wasm32-wasip2/release/anilife_example_org_provider.wasm
```

Import that `.wasm` file into AniLife. After importing, open an anime episode so AniLife invokes the provider's `servers` export. Check the app's provider/runtime logs for the `Example.org request completed` message.

## ABI note

The WIT package in this sample uses `anilili:provider/host@1.0.0`, one of the host-function namespaces registered by AniLife. Its record shapes mirror the fields passed to and read from the host in `WasmAnimeProviders.kt`. This is a starter example; if your checkout has changed its provider ABI, regenerate/update `wit/provider.wit` to match that exact revision.
