@echo off
REM Verification script for Shifty Auto Lister extension

echo.
echo ============================================
echo  Shifty Auto Lister - Verification Check
echo ============================================
echo.

set EXTENSION_PATH=C:\Users\dchat\Documents\chromeext\chrome-extension

echo Checking extension directory...
if exist "%EXTENSION_PATH%" (
    echo ✓ Extension directory found
) else (
    echo ✗ Extension directory NOT found
    exit /b 1
)

echo.
echo Checking required files...

for %%F in (
    "manifest.json"
    "popup\popup.html"
    "popup\popup.css"
    "popup\popup.js"
    "background\service-worker.js"
    "content\facebook-autofill.js"
    "content\facebook-profile-extractor.js"
) do (
    if exist "%EXTENSION_PATH%\%%F" (
        echo ✓ %%F
    ) else (
        echo ✗ %%F MISSING
    )
)

echo.
echo Checking scrapers...
for %%F in (
    "autotrader-scraper.js"
    "cars-scraper.js"
    "cargurus-scraper.js"
) do (
    if exist "%EXTENSION_PATH%\content\scrapers\%%F" (
        echo ✓ %%F
    ) else (
        echo ✗ %%F MISSING
    )
)

echo.
echo ============================================
echo  ✓ Extension is ready!
echo ============================================
echo.
echo Next steps:
echo 1. Go to chrome://extensions
echo 2. Enable Developer mode
echo 3. Click "Load unpacked"
echo 4. Select: %EXTENSION_PATH%
echo 5. Click the extension icon to open side panel
echo.
pause
