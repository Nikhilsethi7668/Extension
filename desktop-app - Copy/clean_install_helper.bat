@echo off
echo ==========================================
echo   Flash Fender Clean Build Helper
echo ==========================================

echo [1/4] Killing running instances...
taskkill /F /IM "Flash Fender Auto-Poster.exe" 2>nul
taskkill /F /IM "FlashFenderAutoPoster.exe" 2>nul
taskkill /F /IM "electron.exe" 2>nul

echo [2/4] Cleaning old builds...
if exist dist rmdir /s /q dist

echo [3/4] Building new version...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo BUILD FAILED! Please check the errors above.
    pause
    exit /b %ERRORLEVEL%
)

echo [4/4] Opening build folder...
start dist

echo ==========================================
echo   SUCCESS! 
echo   Please install the new .exe file from the opened folder.
echo ==========================================
pause
