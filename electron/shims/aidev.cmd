@echo off
setlocal
set "TARGET_DIR=%~1"
if "%TARGET_DIR%"=="." (
  set "TARGET_DIR=%CD%"
)
if "%TARGET_DIR%"=="" (
  set "TARGET_DIR=%CD%"
)

if exist "%~dp0Aidev.exe" (
  start "" "%~dp0Aidev.exe" "%TARGET_DIR%"
) else if exist "%~dp0Aidev Desktop.exe" (
  start "" "%~dp0Aidev Desktop.exe" "%TARGET_DIR%"
) else if exist "%~dp0..\Aidev.exe" (
  start "" "%~dp0..\Aidev.exe" "%TARGET_DIR%"
) else if exist "%~dp0..\Aidev Desktop.exe" (
  start "" "%~dp0..\Aidev Desktop.exe" "%TARGET_DIR%"
) else if exist "%LOCALAPPDATA%\Programs\Aidev\Aidev.exe" (
  start "" "%LOCALAPPDATA%\Programs\Aidev\Aidev.exe" "%TARGET_DIR%"
) else if exist "%LOCALAPPDATA%\Programs\Aidev Desktop\Aidev Desktop.exe" (
  start "" "%LOCALAPPDATA%\Programs\Aidev Desktop\Aidev Desktop.exe" "%TARGET_DIR%"
) else if exist "C:\Program Files\Aidev\Aidev.exe" (
  start "" "C:\Program Files\Aidev\Aidev.exe" "%TARGET_DIR%"
) else (
  echo [Aidev]: Aidev Desktop executable not found.
)
endlocal
