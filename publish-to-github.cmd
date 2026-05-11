@echo off
REM ============================================================
REM  publish-to-github.cmd
REM  Push this local folder to an EXISTING GitHub repo:
REM    https://github.com/shiliyu1991-lang/mcp_for_cocos2.4
REM
REM  Safe to re-run. On first run it sets up git, on later runs
REM  it just adds + commits + pushes the diff.
REM ============================================================

setlocal ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

set REMOTE_URL=https://github.com/shiliyu1991-lang/mcp_for_cocos2.4.git

if not exist ".git" (
    echo === git init ===
    git init -b main || goto :err
)

REM Ensure user.name / user.email are set so commit doesn't fail.
for /f "delims=" %%A in ('git config user.email 2^>nul') do set HAS_EMAIL=%%A
if "%HAS_EMAIL%"=="" (
    git config user.name  "shiliyu1991-lang"
    git config user.email "shiliyu1991@gmail.com"
)

REM Make sure 'origin' points at the right repo.
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo === adding remote origin ===
    git remote add origin %REMOTE_URL% || goto :err
) else (
    git remote set-url origin %REMOTE_URL%
)

echo === staging files ===
git add -A || goto :err

echo === commit (skipped if nothing changed) ===
git diff --cached --quiet
if errorlevel 1 (
    set /p MSG=Commit message ^(enter for default^):
    if "!MSG!"=="" set MSG=update
    git commit -m "!MSG!" || goto :err
) else (
    echo [INFO] Nothing new to commit.
)

echo === pushing to origin main ===
git push -u origin main
if errorlevel 1 (
    echo.
    echo [HINT] push was rejected. Likely because the GitHub repo was created with a README.
    echo Choose ONE:
    echo   A^) Merge remote first:
    echo        git pull origin main --allow-unrelated-histories
    echo        git push -u origin main
    echo   B^) Force-overwrite remote (discards remote README/LICENSE^):
    echo        git push -u origin main --force
    exit /b 1
)

echo.
echo === DONE ===
echo https://github.com/shiliyu1991-lang/mcp_for_cocos2.4
exit /b 0

:err
echo.
echo [FAILED] One of the steps above errored. Scroll up to see which.
exit /b 1
