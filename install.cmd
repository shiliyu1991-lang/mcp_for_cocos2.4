@echo off
setlocal

rem cocosMcp 一键安装提示脚本（Windows）
rem 这只是个引导脚本——把扩展拷到目标项目并装好 npm/python 依赖。
rem 默认目标项目路径取 E:\huoyin\trunk，可通过参数覆盖：
rem   install.cmd D:\path\to\your\cocos\project

set TARGET_PROJECT=%~1
if "%TARGET_PROJECT%"=="" set TARGET_PROJECT=E:\huoyin\trunk

set ROOT=%~dp0
set EXT_SRC=%ROOT%extension
set EXT_DST=%TARGET_PROJECT%\packages\cocos-mcp
set SERVER_DIR=%ROOT%server

echo === cocosMcp installer ===
echo  source extension : %EXT_SRC%
echo  target project   : %TARGET_PROJECT%
echo  package dst      : %EXT_DST%
echo  server dir       : %SERVER_DIR%
echo.

if not exist "%TARGET_PROJECT%" (
    echo [!] target project does not exist: %TARGET_PROJECT%
    echo     pass the project path as the first argument:
    echo         install.cmd D:\path\to\your\cocos\project
    exit /b 1
)

echo [1/3] copying extension to %EXT_DST% ...
if not exist "%EXT_DST%" mkdir "%EXT_DST%"
xcopy /E /I /Y "%EXT_SRC%\*" "%EXT_DST%\" >nul
if errorlevel 1 (
    echo [!] xcopy failed
    exit /b 1
)

echo [2/3] installing extension npm dependencies (ws) ...
pushd "%EXT_DST%" >nul
where npm >nul 2>&1
if errorlevel 1 (
    echo [!] npm not on PATH. Skipping npm install — install Node.js or run it manually.
) else (
    call npm install --no-audit --no-fund --omit=dev
)
popd >nul

echo [3/3] installing Python server in editable mode ...
pushd "%SERVER_DIR%" >nul
where uv >nul 2>&1
if errorlevel 1 (
    where python >nul 2>&1
    if errorlevel 1 (
        echo [!] neither uv nor python on PATH. Install Python 3.10+ and re-run.
    ) else (
        if not exist .venv\Scripts\python.exe (
            python -m venv .venv
        )
        call .venv\Scripts\python.exe -m pip install --upgrade pip
        call .venv\Scripts\python.exe -m pip install -e .
    )
) else (
    uv pip install -e .
)
popd >nul

echo.
echo === done ===
echo  1. open Cocos Creator on your project; menu 扩展 → Cocos MCP should appear.
echo  2. point Claude Desktop / Claude Code at:
echo         %SERVER_DIR%\.venv\Scripts\python.exe -m main --transport stdio
echo     (see docs\claude-mcp-config-example.json)
echo.
endlocal
