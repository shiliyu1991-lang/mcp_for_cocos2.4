@echo off
REM ============================================================
REM  publish-to-github.cmd
REM  One-shot script: init repo, first commit, create private
REM  GitHub repo "mcp_for_cocoscreator2.4" and push.
REM  Requires: gh CLI (https://cli.github.com/) already logged in
REM            (`gh auth status` should be green).
REM ============================================================

setlocal ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

echo.
echo === checking gh ===
gh auth status >nul 2>&1
if errorlevel 1 (
    echo [ERROR] gh CLI not logged in. Run: gh auth login
    exit /b 1
)

if not exist ".git" (
    echo.
    echo === git init ===
    git init -b main || goto :err
)

echo.
echo === staging files (with .gitignore applied) ===
git add -A || goto :err

REM Make sure user.name / user.email are set (use gh's identity if not).
for /f "delims=" %%A in ('git config user.email 2^>nul') do set HAS_EMAIL=%%A
if "%HAS_EMAIL%"=="" (
    for /f "delims=" %%A in ('gh api user --jq ".login"') do set GH_LOGIN=%%A
    for /f "delims=" %%A in ('gh api user --jq ".email // empty"') do set GH_EMAIL=%%A
    if "%GH_EMAIL%"=="" set GH_EMAIL=!GH_LOGIN!@users.noreply.github.com
    git config user.name  "!GH_LOGIN!"
    git config user.email "!GH_EMAIL!"
)

echo.
echo === first commit ===
git commit -m "chore: initial commit (cocosMcp MVP)" || (
    echo [INFO] Nothing new to commit, that's fine.
)

echo.
echo === creating private GitHub repo + pushing ===
gh repo create mcp_for_cocoscreator2.4 --private --source=. --remote=origin --push --description "MCP server + Cocos Creator 2.4 editor extension bridging Claude to the editor" || goto :err

echo.
echo === DONE ===
gh repo view --web
exit /b 0

:err
echo.
echo [FAILED] One of the steps above errored. Scroll up to see which.
exit /b 1
