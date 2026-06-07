@echo off
title Network Traffic Sentinel - Stop Server
echo ==================================================
echo [STATUS] Stopping Dev Server on port 1420...
echo ==================================================

set "PORT=1420"
set "PID="

:: Find the process ID listening on port 1420
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":%PORT% "') do (
    set "PID=%%a"
)

if "%PID%"=="" (
    :: Try loose match if exact match didn't catch it
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr /C:"%PORT%"') do (
        set "PID=%%a"
    )
)

if not "%PID%"=="" (
    echo [INFO] Found server process (PID: %PID%) on port %PORT%.
    echo [STATUS] Terminating process...
    taskkill /F /PID %PID% >nul 2>&1
    if errorlevel 0 (
        echo [SUCCESS] Service on port %PORT% stopped successfully.
    ) else (
        echo [ERROR] Failed to stop the process. You may need to run this script as Administrator.
    )
) else (
    echo [INFO] No active service found running on port %PORT%.
)

echo ==================================================
pause
