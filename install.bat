@echo off
setlocal EnableDelayedExpansion
title HomeStream Installer Builder

echo.
echo  ==========================================
echo   HomeStream — Build Installer for Windows
echo  ==========================================
echo.
echo  Features: Multi-profile watch history, per-profile watchlists,
echo            per-profile playback settings, Kids Mode content filter
echo.

:: ── Check Node.js ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js not found.
    echo.
    echo  Downloading Node.js installer...
    echo  Please install Node.js 22 LTS from the page that opens, then re-run this script.
    echo.
    start https://nodejs.org/en/download
    pause
    exit /b 1
)

for /f "tokens=1 delims=v" %%i in ('node --version') do set NODE_RAW=%%i
for /f "tokens=1 delims=." %%i in ('node --version') do (
    set NODE_MAJOR=%%i
    set NODE_MAJOR=!NODE_MAJOR:v=!
)

echo  [✓] Node.js found: v%NODE_MAJOR% series

if %NODE_MAJOR% LSS 18 (
    echo.
    echo  [!] Node.js 18 or higher is required. You have v%NODE_MAJOR%.
    echo  Please update from https://nodejs.org and re-run this script.
    echo.
    start https://nodejs.org/en/download
    pause
    exit /b 1
)

:: ── Check npm ─────────────────────────────────────────────────────────────────
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] npm not found. Please reinstall Node.js from https://nodejs.org
    pause
    exit /b 1
)
echo  [✓] npm found

:: ── Install dependencies ──────────────────────────────────────────────────────
echo.
echo  [1/3] Installing dependencies...
echo        (this may take a few minutes the first time)
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  [!] npm install failed. Check the output above for errors.
    pause
    exit /b 1
)
echo  [✓] Dependencies installed

:: ── Build ─────────────────────────────────────────────────────────────────────
echo.
echo  [2/3] Building HomeStream...
echo        (compiling frontend + server bundle)
echo.
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo  [!] Build failed. Check the output above for errors.
    pause
    exit /b 1
)
echo  [✓] Build complete

:: ── Package Electron installer ────────────────────────────────────────────────
echo.
echo  [3/3] Packaging Windows installer...
echo        (creating HomeStream-Setup.exe)
echo.
call npx electron-builder --win --config electron/electron-builder.yml --publish never
if %errorlevel% neq 0 (
    echo.
    echo  [!] Packaging failed. Check the output above for errors.
    pause
    exit /b 1
)

:: ── Done ──────────────────────────────────────────────────────────────────────
echo.
echo  ==========================================
echo   Done! Installer is ready.
echo  ==========================================
echo.
echo  Location: dist-electron\
echo.
echo  Data files (created on first run):
echo    media-library.json        - your media library
echo    homestream-profiles.json  - user profiles (up to 6)
echo    homestream-watchlist.json - per-profile My List
echo    homestream-config.json    - app configuration
echo.

:: Open the output folder
explorer dist-electron

echo  Double-click HomeStream-Setup-*.exe to install.
echo.
pause
