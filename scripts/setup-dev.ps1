#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Development environment setup for Smart Factory Supervisor.
.DESCRIPTION
    Checks prerequisites, installs dependencies, and builds core components.
    Run from the repository root.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/setup-dev.ps1
#>

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Smart Factory Supervisor - Dev Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Prerequisites check ─────────────────────────────────────────────────────

$missing = @()

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $missing += "Node.js"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $missing += "Docker"
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    $missing += "uv (pip install uv)"
}

if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
    $missing += "CMake"
}

if ($missing.Count -gt 0) {
    Write-Host "❌ Missing prerequisites: $($missing -join ', ')" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install the missing tools and re-run this script." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ All prerequisites found" -ForegroundColor Green

# ── Frontend setup ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "📦 Setting up frontend..." -ForegroundColor Yellow
Set-Location -LiteralPath "$repoRoot/src/ops-frontend"

npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Frontend ready" -ForegroundColor Green

# ── Python services setup ───────────────────────────────────────────────────

Write-Host ""
Write-Host "🐍 Setting up Python services..." -ForegroundColor Yellow

$pythonServices = @(
    @{ Name = "ops-api";     Path = "$repoRoot/src/ops-api" },
    @{ Name = "ai-service";  Path = "$repoRoot/src/ai-service" },
    @{ Name = "ai-agent";    Path = "$repoRoot/src/ai-agent" }
)

foreach ($svc in $pythonServices) {
    Write-Host "  Installing $($svc.Name)..." -ForegroundColor Gray
    Set-Location -LiteralPath $svc.Path
    uv sync
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ uv sync failed for $($svc.Name)" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✅ $($svc.Name) ready" -ForegroundColor Green
}

# ── Core platform build ─────────────────────────────────────────────────────

Write-Host ""
Write-Host "⚙️  Setting up core platform..." -ForegroundColor Yellow
Set-Location -LiteralPath "$repoRoot/src/core-platform/cpp"

cmake -B build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ CMake configure failed" -ForegroundColor Red
    exit 1
}

cmake --build build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ CMake build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Core platform ready" -ForegroundColor Green

# ── Done ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  🎉 Setup complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  docker compose -f src/docker-compose.yaml up -d" -ForegroundColor Cyan
Write-Host ""
Set-Location -LiteralPath $repoRoot
