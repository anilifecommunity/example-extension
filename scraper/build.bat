@echo off
setlocal

cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install
)

echo Building WebAssembly component...
node build.mjs
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo.
echo Built: %~dp0animesalt.wasm
"