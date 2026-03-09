@echo off
chcp 65001 >nul 2>&1
title JobHuntX by WapVenture

echo.
echo    ========================================
echo       JobHuntX by WapVenture
echo    ========================================
echo    Chat + Music + Image + Video
echo    ========================================
echo.

cd /d "%~dp0"

:: Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python from https://python.org
    pause
    exit /b 1
)

:: Create virtual environment if needed
if not exist ".venv" (
    echo [*] Creating virtual environment...
    python -m venv .venv
    echo.
)

:: Always ensure dependencies are up to date
echo [*] Checking dependencies...
.venv\Scripts\pip install -q -r requirements.txt

:: Check if PyTorch is installed (needed for Music Studio)
.venv\Scripts\pip show torch >nul 2>&1
if errorlevel 1 (
    echo.
    echo [*] PyTorch not found - Music Studio will prompt you to install it.
    echo [*] You can also install it now with:
    echo     .venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cpu
    echo.
)

echo.
echo [*] Starting JobHuntX on http://localhost:8000
echo [*] Open this URL in your browser
echo [*] Press Ctrl+C to stop
echo.

start http://localhost:8000
.venv\Scripts\python app.py
pause

