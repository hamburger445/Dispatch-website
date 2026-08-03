@echo off
cd /d "%~dp0\.."
if not exist "logs\" mkdir logs
node backend\server.js >> logs\startup.log 2>&1
