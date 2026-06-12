@echo off
setlocal EnableDelayedExpansion
title HomeStream

:: ============================================================
::  HomeStream — Quick Launcher (Gaming PC / Temporary Setup)
::
::  This script runs HomeStream directly from source code.
::  No installer, no Electron build needed — just Node.js.
::
::  Requirements:
::    - Node.js 18 or higher  (https://nodejs.org)
::    - That's it.
::
::  What it does:
::    1. Checks for Node.js
::    2. Installs npm packages (first run only, ~2 min)
::    3. Builds the app (first run only, ~1 min)
::    4. Starts the HomeStream server
::    5. Opens your browser to http://localhost:3000
::
::  To stop HomeStream: close this window or press Ctrl+C
:: ============================================================

echo.
echo  =====================================================
echo    HomeStream  ^|  Self-Hosted Media Streaming
echo  =====================================================
echo.

:: ── Check Node.js ─────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js is not installed.
    echo.
    echo  HomeStream needs Node.js to run.
    echo  Opening the download page now...
    echo.
    echo  1. Download and install Node.js 22 LTS
    echo  2. Restart your computer
    echo  3. Double-click launch.bat again
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
    echo  [!] Node.js 18 or higher is required.
    echo      You have: v!NODE_MAJOR!
    echo.
    echo  Please update Node.js from https://nodejs.org
    echo  then double-click launch.bat again.
    echo.
    start https://nodejs.org/en/download
    pause
    exit /b 1
)
echo  [OK] Node.js v!NODE_MAJOR! found

:: ── Install dependencies (first run only) ─────────────────
if not exist "node_modules\express\package.json" (
    echo.
    echo  [1/2] Installing packages... (first run, ~2 minutes)
    echo.
    call npm install --prefer-offline
    if %errorlevel% neq 0 (
        echo.
        echo  [!] Package install failed.
        echo      Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo  [OK] Packages installed
)

:: ── Build (first run or after updates) ────────────────────
if not exist "dist\server\server.bundle.cjs" (
    echo.
    echo  [2/2] Building HomeStream... (first run, ~1 minute)
    echo.
    call npm run build
    if %errorlevel% neq 0 (
        echo.
        echo  [!] Build failed.
        echo      Check the output above for errors.
        pause
        exit /b 1
    )
    echo  [OK] Build complete
)

:: ── Get local IP for LAN display ──────────────────────────
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "169.254"') do (
    set LAN_IP=%%a
    set LAN_IP=!LAN_IP: =!
    goto :got_ip
)
:got_ip

:: ── Start server ───────────────────────────────────────────
echo.
echo  =====================================================
echo    Starting HomeStream...
echo  =====================================================
echo.
echo  Local:   http://localhost:3000
if defined LAN_IP (
    echo  Network: http://!LAN_IP!:3000
    echo.
    echo  Share the Network address with phones / other PCs
    echo  on your WiFi to use HomeStream as a remote.
)
echo.
echo  Press Ctrl+C or close this window to stop HomeStream.
echo  =====================================================
echo.

:: Open browser after a short delay (server needs ~3s to start)
start /b "" cmd /c "ping -n 5 127.0.0.1 >nul && start http://localhost:3000"

:: Run the server (keeps this window open as the log console)
set PORT=3000
node dist\server\server.bundle.cjs

:: If we get here the server exited
echo.
echo  HomeStream has stopped.
pause
