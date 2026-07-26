@echo off
title UltraTransfer .NET Launcher
cd /d "%~dp0"

echo ===================================================
echo   Compiling UltraTransfer .NET Executable...
echo ===================================================

"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /target:exe /out:UltraTransfer.exe /r:System.dll,System.Core.dll Program.cs

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Compilation failed!
    pause
    exit /b %errorlevel%
)

echo.
echo [SUCCESS] UltraTransfer.exe compiled successfully!
echo Starting server...
echo.

start UltraTransfer.exe
