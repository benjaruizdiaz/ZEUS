@echo off
title ZEUS Server
echo.
echo  ⚡ Iniciando ZEUS...
echo.
cd /d "%~dp0"
start "" "%~dp0zeus-app.html"
node server.js
pause
