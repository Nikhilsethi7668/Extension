#!/usr/bin/env powershell
# AutoBridge Dashboard Launcher (PowerShell)
# Connects dashboard to live Cloudflare API

Write-Host "`n" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "   AutoBridge Dashboard Launcher" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "`n" -ForegroundColor Cyan

Set-Location "admin-dashboard"

Write-Host "Setting API URL to live Cloudflare endpoint..." -ForegroundColor Yellow
$env:REACT_APP_API_URL = "https://autobridge-backend.dchatpar.workers.dev/api"

Write-Host "Starting dashboard on http://localhost:3002..." -ForegroundColor Green
Write-Host ""
Write-Host "Dashboard will open in your browser automatically." -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop the dashboard." -ForegroundColor Gray
Write-Host ""

npm start
