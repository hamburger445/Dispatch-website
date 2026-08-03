@echo off
setlocal EnableDelayedExpansion
title Greenville CAD Dispatch Console
cd /d "%~dp0"

echo ============================================
echo   Greenville CAD Dispatch Console
echo ============================================
echo.

where node >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

echo [INFO] Node.js version:
node --version
echo.

if not exist "node_modules\" (
    echo [INFO] Installing backend dependencies...
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Failed to install backend dependencies.
        pause
        exit /b 1
    )
)

if not exist "frontend\node_modules\" (
    echo [INFO] Installing frontend dependencies...
    pushd frontend
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Failed to install frontend dependencies.
        popd
        pause
        exit /b 1
    )
    popd
)

if not exist "frontend\dist\index.html" (
    echo [INFO] Building frontend...
    pushd frontend
    call npm run build
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Failed to build frontend.
        popd
        pause
        exit /b 1
    )
    popd
)

:: Stop outdated server (missing traffic-stops API, etc.)
node scripts\check-server.js >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo [INFO] Updating server — stopping old instance on port 3000...
    node scripts\stop-server.js
    timeout /t 2 /nobreak >nul
)

:: Start server if not already running current version
node scripts\check-server.js >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo [INFO] Starting Greenville CAD server...
    if not exist "logs\" mkdir logs
    start "Greenville CAD Server" /MIN "%~dp0scripts\run-server.bat"
    echo [INFO] Waiting for server to start...
    node scripts\wait-for-server.js
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Server did not start in time. Check logs\startup.log
        pause
        exit /b 1
    )
) else (
    echo [INFO] Server is up to date at http://localhost:3000
)

echo [INFO] Opening dispatch console...
start "" "http://localhost:3000"

echo.
echo ============================================
echo   Greenville CAD is now running.
echo   Close "Greenville CAD Server" to stop.
echo ============================================
echo.
pause
