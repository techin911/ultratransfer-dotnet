@echo off
title Push Project to GitHub for Render Deployment
cd /d "%~dp0"

echo ====================================================================
echo   AUTOMATED GITHUB PUSH FOR RENDER.COM DEPLOYMENT
echo ====================================================================
echo.
echo Please create a new public repository on https://github.com/new first.
echo.
set /p repo_url="Enter your GitHub Repository URL (e.g., https://github.com/user/repo.git): "

if "%repo_url%"=="" (
    echo.
    echo [ERROR] No GitHub URL provided. Exiting...
    pause
    exit /b 1
)

echo.
echo [1/5] Initializing Git repository...
git init

echo.
echo [2/5] Adding all project files...
git add .

echo.
echo [3/5] Creating commit...
git commit -m "Initial commit for Render deployment"

echo.
echo [4/5] Setting main branch and remote URL...
git branch -M main
git remote remove origin 2>nul
git remote add origin %repo_url%

echo.
echo [5/5] Pushing files to GitHub...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ====================================================================
    echo   [SUCCESS] Code successfully pushed to GitHub!
    echo ====================================================================
    echo.
    echo Now open Render.com:
    echo 1. Go to https://dashboard.render.com/web/new
    echo 2. Paste your GitHub URL: %repo_url%
    echo 3. Click "Connect" -> "Create Web Service"
    echo.
) else (
    echo.
    echo [!] Push failed or required login. Check your GitHub URL and try again.
)

pause
