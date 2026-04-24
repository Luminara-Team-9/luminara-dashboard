@echo off
setlocal enabledelayedexpansion
title Luminara Environment Setup (Python 3.12 Explicit)

echo ============================================
echo 🚦 LUMINARA SRE: Environment Check Start
echo ============================================

:: 1. Check/Create Virtual Environment
:: We use 'py -3.12' to ensure we don't accidentally use 3.13 or 3.11
if not exist ".venv" (
    echo [..] .venv not found. Creating Python 3.12 environment...
    py -3.12 -m venv .venv
    if !errorlevel! equ 0 (
        echo [OK] .venv created successfully using Python 3.12.
    ) else (
        echo [!] FAILED to create .venv. 
        echo [?] Ensure Python 3.12.9 is installed and the 'py' launcher is in PATH.
        pause
        exit /b 1
    )
) else (
    echo [OK] Existing .venv detected.
)

:: 2. Activate Environment
echo [..] Activating environment...
call .venv\Scripts\activate
if !errorlevel! equ 0 (
    echo [OK] Environment activated.
) else (
    echo [!] FAILED to activate environment.
    pause
    exit /b 1
)

:: 3. Python Dependencies (Layered Install)
echo [..] Installing Core AI Engine (PyTorch 2.5.0 for 3.12)...
:: Explicitly installing the 3.12 stable wheel for CUDA 12.4
python -m pip install --upgrade pip >nul
pip install torch>=2.5.0 --index-url https://download.pytorch.org/whl/cu124
if !errorlevel! equ 0 (
    echo [OK] PyTorch Engine installed.
) else (
    echo [!] FAILED to install Torch.
    pause
    exit /b 1
)

echo [..] Installing remaining dependencies from requirements.txt...
pip install -r requirements.txt
if !errorlevel! equ 0 (
    echo [OK] All dependencies satisfied.
) else (
    echo [!] Installation failed. Check requirements.txt for 3.12 compatibility.
    pause
    exit /b 1
)

:: 4. Node.js Packages (pnpm)
echo [..] Checking pnpm Node.js packages...
:: Note: This uses the global Node 24 engine we set up earlier
call pnpm install
if !errorlevel! equ 0 (
    echo [OK] pnpm workspace packages are synchronized.
) else (
    echo [!] FAILED pnpm install. Ensure pnpm is installed (npm install -g pnpm).
    pause
    exit /b 1
)

:: 5. Playwright Browser Check
echo [..] Checking Playwright Chromium binaries...
playwright install chromium
if !errorlevel! equ 0 (
    echo [OK] Playwright Chromium is ready for auditing.
) else (
    echo [!] FAILED to install Playwright Chromium.
)

echo ============================================
echo ✅ LUMINARA SETUP COMPLETE: Ready to code!
echo ============================================
pause