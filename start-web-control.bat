@echo off
setlocal

cd /d "%~dp0"
title Aero Web Control Launcher

echo [Aero] Starting local web control...

where node >nul 2>nul
if errorlevel 1 (
  echo [Aero] Node.js is not installed or not in PATH.
  echo [Aero] Install Node.js, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Aero] npm is not installed or not in PATH.
  echo [Aero] Reinstall Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [Aero] Installing dependencies first run...
  call npm install
  if errorlevel 1 (
    echo [Aero] npm install failed.
    pause
    exit /b 1
  )
)

netstat -ano | findstr ":8080" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo [Aero] Launching backend server in a new window...
  start "Aero Web Control Server" cmd /k "cd /d ""%~dp0"" & npm start"
) else (
  echo [Aero] Port 8080 already has a listening process.
  echo [Aero] Reusing existing local backend.
)

echo [Aero] Opening website pages...
start "" "https://aero-client.github.io/aero/"
start "" "http://localhost:8080/admin.html"

echo [Aero] Done. Keep the server window open while using admin.
pause
