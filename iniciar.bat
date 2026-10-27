@echo off
setlocal enabledelayedexpansion
TITLE Moura Leite - Sistema de Reembolsos

echo ============================================================
echo  Moura Leite - Sistema de Reembolsos v2.0
echo ============================================================
echo.

:: Tenta encontrar Python
set PYTHON_CMD=
for %%P in (python python3.11 python3 py) do (
    %%P --version >nul 2>&1
    if !errorlevel! == 0 (
        set PYTHON_CMD=%%P
        goto :found_python
    )
)

echo [ERRO] Python nao encontrado no PATH!
echo.
echo Por favor, instale o Python 3.11 em: https://www.python.org/downloads/
echo Certifique-se de marcar "Add Python to PATH" durante a instalacao.
echo.
pause
exit /b 1

:found_python
echo [OK] Python encontrado: %PYTHON_CMD%
%PYTHON_CMD% --version
echo.

:: Instalar dependencias
echo [1/2] Instalando dependencias...
%PYTHON_CMD% -m pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias
    pause
    exit /b 1
)
echo [OK] Dependencias instaladas!
echo.

:: Iniciar servidor
echo [2/2] Iniciando servidor...
echo.
echo ============================================================
echo  Acesse: http://localhost:8000
echo  Documentacao API: http://localhost:8000/api/docs
echo  Pressione Ctrl+C para encerrar
echo ============================================================
echo.
start http://localhost:8000
%PYTHON_CMD% -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
