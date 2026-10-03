@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>&1
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\Temp\opencode\node-runtime\node-v24.21.0-win-x64\node.exe" (
    set "PATH=%LOCALAPPDATA%\Temp\opencode\node-runtime\node-v24.21.0-win-x64;%PATH%"
  )
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 24 LTS from https://nodejs.org and try again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
if not exist functions\node_modules\firebase-admin (
  call npm --prefix functions ci --omit=dev
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node functions\scripts\start-local-admin.js
pause
