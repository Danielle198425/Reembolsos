# Script PowerShell de inicialização
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Moura Leite - Sistema de Reembolsos v2.0" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Encontrar Python
$pythonCmds = @("python3.11", "python3", "python")
$pythonCmd = $null

foreach ($cmd in $pythonCmds) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) {
        $pythonCmd = $cmd
        break
    }
}

# Tentar caminhos comuns
if (-not $pythonCmd) {
    $commonPaths = @(
        "C:\Python311\python.exe",
        "C:\Python310\python.exe",
        "C:\Python39\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe"
    )
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $pythonCmd = $path
            break
        }
    }
}

if (-not $pythonCmd) {
    Write-Host "[ERRO] Python nao encontrado!" -ForegroundColor Red
    Write-Host "Instale Python 3.11 em: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "Marque 'Add Python to PATH' durante a instalacao." -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host "[OK] Python: $pythonCmd" -ForegroundColor Green
& $pythonCmd --version
Write-Host ""

# Instalar dependências
Write-Host "[1/2] Instalando dependencias..." -ForegroundColor Yellow
& $pythonCmd -m pip install -r requirements.txt --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Falha ao instalar dependencias" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}
Write-Host "[OK] Dependencias instaladas!" -ForegroundColor Green
Write-Host ""

# Iniciar servidor
Write-Host "[2/2] Iniciando servidor..." -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Acesse: http://localhost:8000" -ForegroundColor Green
Write-Host " API Docs: http://localhost:8000/api/docs" -ForegroundColor Green
Write-Host " Ctrl+C para encerrar" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Abrir navegador após 2 segundos
Start-Job -ScriptBlock {
    Start-Sleep 2
    Start-Process "http://localhost:8000"
} | Out-Null

& $pythonCmd -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
