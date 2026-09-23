@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
if not exist "%~dp0..\node_modules" (
  if exist "%~dp0..\vendor" (
    mklink /J "%~dp0..\node_modules" "%~dp0..\vendor" >nul 2>&1
  )
)
if exist "%~dp0..\..\..\Aidev.exe" (
  "%~dp0..\..\..\Aidev.exe" "%~dp0npm-cli.js" %*
) else if exist "%~dp0..\..\..\Aidev Desktop.exe" (
  "%~dp0..\..\..\Aidev Desktop.exe" "%~dp0npm-cli.js" %*
) else if exist "%~dp0..\..\Aidev.exe" (
  "%~dp0..\..\Aidev.exe" "%~dp0npm-cli.js" %*
) else if exist "%~dp0..\..\Aidev Desktop.exe" (
  "%~dp0..\..\Aidev Desktop.exe" "%~dp0npm-cli.js" %*
) else (
  node "%~dp0npm-cli.js" %*
)
endlocal
