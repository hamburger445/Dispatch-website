@echo off
REM Push the Dispatch project to GitHub
cd /d "c:\Users\ivers\Downloads\bots\dispatch"

echo Staging changes...
git add .

set /p COMMIT_MSG="Enter commit message (default: Update project): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update project

echo Committing...
git commit -m "%COMMIT_MSG%"
if %errorlevel% neq 0 (
    echo Nothing to commit or commit failed.
)

echo Pushing to origin/main...
git push origin main
if %errorlevel% neq 0 (
    echo Push failed. Check your credentials or remote.
    pause
    exit /b 1
)

echo Done! Changes pushed to GitHub.
pause
