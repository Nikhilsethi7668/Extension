@echo off
echo Testing PowerShell Startup Script...
echo.

set "EXE_PATH=C:\Users\itsad\AppData\Local\Programs\Flash Fender Auto-Poster\Flash Fender Auto-Poster.exe"
set "SHORTCUT_NAME=FlashFenderAutoPoster.lnk"

echo [1] Creating startup shortcut...
powershell -Command "$exePath = '%EXE_PATH%'; $shortcutName = '%SHORTCUT_NAME%'; $startupFolder = \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\"; $shortcutPath = Join-Path $startupFolder $shortcutName; $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($shortcutPath); $shortcut.TargetPath = $exePath; $shortcut.WorkingDirectory = Split-Path $exePath; $shortcut.Save(); Write-Host 'Shortcut created successfully'"

echo.
echo [2] Checking if shortcut exists...
dir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\%SHORTCUT_NAME%"

echo.
echo [3] Opening Startup folder...
explorer "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

pause
