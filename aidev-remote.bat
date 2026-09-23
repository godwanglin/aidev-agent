@echo off
title Aidev Remote Access Tunnel (Cloudflare)
echo ========================================================
echo   Aidev Desktop Remote Preview Tunnel
echo ========================================================
echo.
echo Starting Cloudflare Tunnel for http://localhost:3001 ...
echo.
if exist "..\cloudflared.exe" (
    "..\cloudflared.exe" tunnel --url http://localhost:3001
) else if exist "cloudflared.exe" (
    "cloudflared.exe" tunnel --url http://localhost:3001
) else (
    echo Downloading cloudflared.exe ...
    curl.exe -L -o "..\cloudflared.exe" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
    "..\cloudflared.exe" tunnel --url http://localhost:3001
)
pause
