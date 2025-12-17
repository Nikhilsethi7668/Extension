#!/usr/bin/env powershell
<#
.SYNOPSIS
Validates AutoBridge Cloudflare deployment setup
.DESCRIPTION
Checks all prerequisites for deploying to Cloudflare Workers with auto-deploy via GitHub Actions
#>

Write-Host "🔍 AutoBridge Cloudflare Deployment Validator`n" -ForegroundColor Cyan

$checks = @()
$allPassed = $true

function Test-Check {
    param([string]$name, [bool]$passed, [string]$detail)
    
    $status = if ($passed) { "✅" } else { "❌" }
    $color = if ($passed) { "Green" } else { "Red" }
    
    Write-Host "$status $name" -ForegroundColor $color
    if ($detail) { Write-Host "   └─ $detail" -ForegroundColor Gray }
    
    if (!$passed) { $script:allPassed = $false }
}

# 1. Check backend folder exists
$backendExists = Test-Path "backend"
Test-Check "Backend folder" $backendExists "$(if ($backendExists) { 'Found' } else { 'Not found' })"

# 2. Check worker.js exists
$workerExists = Test-Path "backend/worker.js"
Test-Check "worker.js file" $workerExists "Cloudflare Workers handler"

# 3. Check wrangler.toml exists
$wranglerExists = Test-Path "backend/wrangler.toml"
Test-Check "wrangler.toml file" $wranglerExists "Cloudflare config"

# 4. Check package.json has wrangler
if ($backendExists) {
    $pkgContent = Get-Content "backend/package.json" -Raw
    $hasWrangler = $pkgContent -match '"wrangler"'
    Test-Check "Wrangler in package.json" $hasWrangler "Deploy tool installed"
}

# 5. Check .github/workflows/deploy.yml exists
$workflowExists = Test-Path ".github/workflows/deploy.yml"
Test-Check "GitHub Actions workflow" $workflowExists "Auto-deploy on push"

# 6. Check git is initialized
$gitExists = Test-Path ".git"
Test-Check "Git repository" $gitExists "$(if ($gitExists) { 'Initialized' } else { 'Not initialized - run: git init' })"

# 7. Check git has remote
if ($gitExists) {
    $remote = & git remote -v 2>$null | Select-Object -First 1
    $hasRemote = ![string]::IsNullOrEmpty($remote)
    Test-Check "Git remote (GitHub)" $hasRemote "$(if ($hasRemote) { 'Configured' } else { 'Not set - run: git remote add origin <url>' })"
}

# 8. Check Node.js installed
$nodeInstalled = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
$nodeVersion = if ($nodeInstalled) { & node --version } else { "Not found" }
Test-Check "Node.js installed" $nodeInstalled "Version: $nodeVersion"

# 9. Check npm installed
$npmInstalled = $null -ne (Get-Command npm -ErrorAction SilentlyContinue)
$npmVersion = if ($npmInstalled) { & npm --version } else { "Not found" }
Test-Check "npm installed" $npmInstalled "Version: $npmVersion"

# 10. Check Wrangler CLI installed
$wranglerInstalled = $null -ne (Get-Command wrangler -ErrorAction SilentlyContinue)
$wranglerVersion = if ($wranglerInstalled) { & wrangler --version 2>$null } else { "Not found" }
Test-Check "Wrangler CLI installed" $wranglerInstalled "Global: $wranglerVersion (or local in backend/node_modules)"

# 11. Check admin-dashboard folder
$dashboardExists = Test-Path "admin-dashboard"
Test-Check "Admin dashboard folder" $dashboardExists "React frontend"

# 12. Check extension folder
$extExists = Test-Path "ext"
Test-Check "Chrome extension folder" $extExists "Browser extension"

Write-Host "`n" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan

if ($allPassed) {
    Write-Host "✅ All checks passed! Ready to deploy to Cloudflare." -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "1. Commit code: git add . && git commit -m 'message'" -ForegroundColor White
    Write-Host "2. Push to GitHub: git push origin main" -ForegroundColor White
    Write-Host "3. Add 4 repository secrets (see CLOUDFLARE_LIVE_SETUP.md):" -ForegroundColor White
    Write-Host "   - CLOUDFLARE_API_TOKEN" -ForegroundColor Gray
    Write-Host "   - CLOUDFLARE_ACCOUNT_ID" -ForegroundColor Gray
    Write-Host "   - GEMINI_API_KEY" -ForegroundColor Gray
    Write-Host "   - JWT_SECRET" -ForegroundColor Gray
    Write-Host "4. Watch GitHub Actions deploy automatically!" -ForegroundColor White
} else {
    Write-Host "❌ Some checks failed. Please review the issues above." -ForegroundColor Red
    Write-Host "`nFor setup help, see: CLOUDFLARE_LIVE_SETUP.md" -ForegroundColor Yellow
}

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
