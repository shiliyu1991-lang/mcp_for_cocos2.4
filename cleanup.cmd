@echo off
setlocal

rem cleanup.cmd — 删除已废弃的旧文件夹和缓存。
rem 跑完仓库里就只剩当前真正在用的东西：
rem   cocos-mcp-2x/  cocos-mcp-3x/  server/  docs/  *.md
rem
rem 运行方式：
rem   双击 cleanup.cmd
rem   或者命令行 cd 到本目录后执行：cleanup.cmd

set ROOT=%~dp0
pushd "%ROOT%" >nul

echo === mcpforcocos cleanup ===
echo.
echo will delete:
echo   - %ROOT%extension\          (legacy 2.4 plugin v0.1, replaced by cocos-mcp-2x\)
echo   - %ROOT%extension-3x\       (legacy 3.x plugin v0.1, replaced by cocos-mcp-3x\)
echo   - %ROOT%install.cmd         (referenced extension/ paths, no longer used)
echo   - %ROOT%docs\unity-mcp-features.html   (reference material, unused)
echo   - %ROOT%server\src\**\__pycache__\     (Python bytecode cache, regen on next run)
echo.
choice /C YN /M "proceed"
if errorlevel 2 goto :cancel

echo.
echo [1/5] removing extension\ ...
if exist extension (
    rmdir /s /q extension
) else (
    echo   already gone, skipping.
)

echo [2/5] removing extension-3x\ ...
if exist extension-3x (
    rmdir /s /q extension-3x
) else (
    echo   already gone, skipping.
)

echo [3/5] removing install.cmd ...
if exist install.cmd (
    del /q install.cmd
) else (
    echo   already gone, skipping.
)

echo [4/5] removing docs\unity-mcp-features.html ...
if exist docs\unity-mcp-features.html (
    del /q docs\unity-mcp-features.html
) else (
    echo   already gone, skipping.
)

echo [5/5] removing __pycache__ folders under server\src\ ...
for /d /r server\src %%d in (__pycache__) do (
    if exist "%%d" (
        echo   - %%d
        rmdir /s /q "%%d"
    )
)

echo.
echo === done ===
echo.
echo remaining at repo root:
dir /b /a:-h

goto :end

:cancel
echo cancelled, nothing changed.

:end
popd >nul
endlocal
pause
