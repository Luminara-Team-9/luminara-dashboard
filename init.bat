@echo off
setlocal enabledelayedexpansion
title Luminara Environment Setup

echo ============================================
echo 🚦 LUMINARA SRE: Environment Check Start
echo ============================================

:: 1. Check/Create Virtual Environment
if not exist ".venv" (
    echo [..] .venv not found. Creating Python 3.13 environment...
    python -m venv .venv
    if !errorlevel! equ 0 (
        echo [OK] .venv created successfully.
    ) else (
        echo [!] FAILED to create .venv. Ensure Python 3.13 is installed and in PATH.
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
echo [..] Installing Core AI Engine (PyTorch) first...
pip install torch>=2.6.0 --index-url https://download.pytorch.org/whl/cu124
if !errorlevel! equ 0 (
    echo [OK] Core AI Engine installed.
) else (
    echo [!] FAILED to install Torch.
    pause
    exit /b 1
)

echo [..] Installing remaining dependencies from requirements.txt...
:: We use --no-build-isolation for flash-attn to use the torch we just installed
pip install -r requirements.txt
if !errorlevel! equ 0 (
    echo [OK] All dependencies satisfied.
) else (
    echo [!] Installation failed. See SRE Note below.
    pause
    exit /b 1
)

:: 4. Node.js Packages (pnpm)
echo [..] Checking pnpm Node.js packages...
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
:: Playwright is smart enough to only install if missing or outdated
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