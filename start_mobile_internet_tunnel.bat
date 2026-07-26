@echo off
title UltraTransfer - Free Public Server Tunnel
cd /d "%~dp0"

:MENU
cls
echo ====================================================================
echo   ULTRATRANSFER - FREE PUBLIC INTERNET TUNNEL LAUNCHER
echo ====================================================================
echo.
echo Make your local server accessible over Mobile Data (4G/5G) for FREE!
echo Ensure UltraTransfer.exe is running on port 5050 before starting.
echo.
echo Select a Free Public Tunnel Server:
echo   [1] Localhost.run (Free SSH Tunnel - Fast & No Setup)
echo   [2] Pinggy.io     (Free SSH Tunnel - HTTP/HTTPS)
echo   [3] Serveo.net    (Free SSH Tunnel - Instant URL)
echo   [4] Cloudflare    (Free Cloudflare Quick Tunnel via npx)
echo   [5] Exit
echo.
set /p choice="Enter option (1-5): "

if "%choice%"=="1" goto LOCALHOSTRUN
if "%choice%"=="2" goto PINGGY
if "%choice%"=="3" goto SERVEO
if "%choice%"=="4" goto CLOUDFLARE
if "%choice%"=="5" exit

:LOCALHOSTRUN
echo.
echo [!] Connecting to Localhost.run free tunnel...
echo Copy the HTTPS URL printed below and open it on your phone!
echo --------------------------------------------------------------------
C:\Windows\System32\OpenSSH\ssh.exe -o StrictHostKeyChecking=no -R 80:localhost:5050 nokey@localhost.run
pause
goto MENU

:PINGGY
echo.
echo [!] Connecting to Pinggy.io free tunnel...
echo Copy the HTTPS URL printed below and open it on your phone!
echo --------------------------------------------------------------------
C:\Windows\System32\OpenSSH\ssh.exe -o StrictHostKeyChecking=no -p 443 -R0:localhost:5050 a.pinggy.io
pause
goto MENU

:SERVEO
echo.
echo [!] Connecting to Serveo.net free tunnel...
echo Copy the HTTPS URL printed below and open it on your phone!
echo --------------------------------------------------------------------
C:\Windows\System32\OpenSSH\ssh.exe -o StrictHostKeyChecking=no -R 80:localhost:5050 serveo.net
pause
goto MENU

:CLOUDFLARE
echo.
echo [!] Launching Cloudflare Quick Tunnel...
call npx -y cloudflared tunnel --url http://localhost:5050
pause
goto MENU
