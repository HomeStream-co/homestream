@echo off
setlocal EnableDelayedExpansion
title HomeStream — Installer Builder

:: ============================================================
::  HomeStream — Build Installer for Windows
::
::  This script builds the full Electron desktop app (.exe).
::  Run this ONCE on any Windows PC that has Node.js installed.
::  The output installer can then be copied to any PC — no
::  Node.js required on the target machine.
::
::  Requirements (this build machine only):
::    - Node.js 18+   https://nodejs.org
::    - ~2 GB free disk space (node_modules + Electron)
::    - Internet connection (first run only)
::
::  Output:
::    dist-electron\HomeStream-Setup-x.x.x.exe   ← NSIS installer
::    dist-electron\HomeStream-x.x.x-portable.exe ← portable (no install)
::    dist-electron\HomeStream-x.x.x-win.zip      ← ZIP archive
::
::  Quick start (gaming PC, no installer needed):
::    → Use launch.bat instead — just needs Node.js, no build step.
:: ============================================================

echo.
echo  =====================================================
echo    HomeStream  ^|  Build Windows Installer
echo  =====================================================
echo.
echo  This will create a standalone .exe installer that can
echo  be copied to any Windows PC (no Node.js required there).
echo.
echo  For a quick start on THIS PC, use launch.bat instead.
echo.

:: ── Check Node.js ─────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js not found.
    echo.
    echo  This build script requires Node.js on THIS machine.
    echo  The OUTPUT installer will NOT require Node.js.
    echo.
    echo  Opening nodejs.org — install Node.js 22 LTS,
    echo  restart your PC, then re-run install.bat.
    echo.
    start https://nodejs.org/en/download
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%i in ('node --version') do (
    set NODE_MAJOR=%%i
    set NODE_MAJOR=!NODE_MAJOR:v=!
)
if !NODE_MAJOR! LSS 18 (
    echo  [!] Node.js 18+ required. You have v!NODE_MAJOR!.
    echo  Update from https://nodejs.org then re-run install.bat.
    echo.
    start https://nodejs.org/en/download
    pause
    exit /b 1
)
echo  [OK] Node.js v!NODE_MAJOR!

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] npm not found. Reinstall Node.js from https://nodejs.org
    pause
    exit /b 1
)
echo  [OK] npm found

:: ── Install dependencies ───────────────────────────────────
echo.
echo  [1/3] Installing dependencies...
echo        (first run takes ~2 minutes — downloads ~500 MB)
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  [!] npm install failed.
    echo      Check your internet connection and try again.
    echo      If behind a proxy, set HTTP_PROXY and HTTPS_PROXY.
    pause
    exit /b 1
)
echo  [OK] Dependencies installed

:: ── Build ──────────────────────────────────────────────────
echo.
echo  [2/3] Building HomeStream...
echo        (compiling frontend + server bundle, ~1 minute)
echo.
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo  [!] Build failed. Check the output above for errors.
    pause
    exit /b 1
)
echo  [OK] Build complete

:: ── Package ────────────────────────────────────────────────
echo.
echo  [3/3] Packaging Windows installer + portable builds...
echo        (downloads Electron ~100 MB on first run)
echo.
call npx electron-builder --win --config electron/electron-builder.yml --publish never
if %errorlevel% neq 0 (
    echo.
    echo  [!] Packaging failed. Check the output above for errors.
    echo.
    echo  Common fixes:
    echo    - Run as Administrator if you get permission errors
    echo    - Disable antivirus temporarily (it can block code signing)
    echo    - Make sure no HomeStream.exe is currently running
    pause
    exit /b 1
)

:: ── Done ───────────────────────────────────────────────────
echo.
echo  =====================================================
echo    Done! Your installers are ready.
echo  =====================================================
echo.

:: List what was built
echo  Files in dist-electron\:
dir /b dist-electron\*.exe dist-electron\*.zip 2>nul
echo.
echo  ── How to distribute ──────────────────────────────
echo.
echo  Option A — Full installer (recommended):
echo    HomeStream-Setup-x.x.x.exe
echo    Double-click to install. Creates Start Menu + Desktop
echo    shortcuts. Uninstall via Windows Settings like any app.
echo.
echo  Option B — Portable (no install needed):
echo    HomeStream-x.x.x-portable.exe
echo    Copy anywhere, double-click to run. No install required.
echo    Great for USB drives or shared PCs.
echo.
echo  Option C — ZIP archive:
echo    HomeStream-x.x.x-win.zip
echo    Extract anywhere, run HomeStream.exe inside.
echo.
echo  All options: no Node.js required on the target PC.
echo.

:: Open output folder
explorer dist-electron

pause
