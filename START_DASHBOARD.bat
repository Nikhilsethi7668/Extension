@echo off
REM AutoBridge Dashboard Launcher
REM Connects dashboard to live Cloudflare API

echo.
echo ====================================
echo   AutoBridge Dashboard Launcher
echo ====================================
echo.

cd admin-dashboard

echo Setting API URL to live Cloudflare endpoint...
set REACT_APP_API_URL=https://autobridge-backend.dchatpar.workers.dev/api

echo Starting dashboard on http://localhost:3002...
echo.
echo Dashboard will open in your browser automatically.
echo Press Ctrl+C to stop the dashboard.
echo.

npm start
