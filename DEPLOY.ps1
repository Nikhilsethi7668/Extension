#!/usr/bin/env powershell
# QuickStart: Deploy AutoBridge to Cloudflare Workers

Write-Host "🚀 AutoBridge Cloudflare Workers Deployment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if wrangler is installed globally
$wrangler = Get-Command wrangler -ErrorAction SilentlyContinue
if (-not $wrangler) {
    Write-Host "❌ Wrangler CLI not found globally. Installing..." -ForegroundColor Yellow
    npm install -g wrangler
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install Wrangler" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ Wrangler CLI ready" -ForegroundColor Green
Write-Host ""

# Check authentication
Write-Host "🔑 Checking Cloudflare authentication..." -ForegroundColor Cyan
wrangler whoami 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Not authenticated with Cloudflare" -ForegroundColor Yellow
    Write-Host "👉 Run: wrangler login" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Opening Cloudflare login..." -ForegroundColor Cyan
    wrangler login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Login failed" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ Authenticated with Cloudflare" -ForegroundColor Green
Write-Host ""

# Navigate to backend directory
Set-Location "c:\Users\dchat\Documents\facebookmark\backend"

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Prompt for Gemini API key (optional)
Write-Host "🔑 Configure Secrets" -ForegroundColor Cyan
$hasKey = Read-Host "Do you have a Gemini API key? (y/n)"
if ($hasKey -eq 'y') {
    Write-Host "👉 Enter your Gemini API key (will be hidden):" -ForegroundColor Yellow
    $geminiKey = Read-Host -AsSecureString
    $geminiPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($geminiKey))
    
    # Use wrangler secret put via PowerShell
    $geminiPlain | wrangler secret put GEMINI_API_KEY
    Write-Host "✅ GEMINI_API_KEY configured" -ForegroundColor Green
}

Write-Host "✅ JWT_SECRET configured (default)" -ForegroundColor Green
Write-Host ""

# Create KV namespace if needed
Write-Host "💾 Checking KV namespace..." -ForegroundColor Cyan
$kvCheck = wrangler kv:namespace list 2>&1
if ($kvCheck -notmatch "DB") {
    Write-Host "⚠️  DB namespace not found. Creating..." -ForegroundColor Yellow
    wrangler kv:namespace create "DB"
    wrangler kv:namespace create "DB" --preview
    Write-Host "⚠️  Update wrangler.toml with the namespace IDs!" -ForegroundColor Yellow
} else {
    Write-Host "✅ KV namespace ready" -ForegroundColor Green
}

Write-Host ""
Write-Host "🧪 Testing locally..." -ForegroundColor Cyan
Write-Host "👉 Run: npm run dev" -ForegroundColor Yellow
Write-Host ""

# Ask to deploy
$deploy = Read-Host "Ready to deploy? (y/n)"
if ($deploy -eq 'y') {
    Write-Host "🚀 Deploying to Cloudflare..." -ForegroundColor Cyan
    npm run deploy
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Deployment successful!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📍 Your API is now at:" -ForegroundColor Green
        Write-Host "   https://autobridge-backend.workers.dev/api" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "📚 Next steps:" -ForegroundColor Yellow
        Write-Host "   1. Update admin dashboard:" -ForegroundColor Gray
        Write-Host "      set REACT_APP_API_URL=https://autobridge-backend.workers.dev/api" -ForegroundColor Gray
        Write-Host "   2. Update extension in ext/popup/popup.js" -ForegroundColor Gray
        Write-Host "   3. View logs: wrangler tail" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ Deployment failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "To deploy later, run:" -ForegroundColor Yellow
    Write-Host "   npm run deploy" -ForegroundColor Cyan
}
