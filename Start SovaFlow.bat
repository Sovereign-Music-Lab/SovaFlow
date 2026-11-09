@echo off
REM Double-click on Windows to open the SovaFlow menu.
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js 22+ from https://nodejs.org then run again. & pause & exit /b 1)
node bin\sovaflow.mjs menu
pause
