@echo off
setlocal enabledelayedexpansion
title Luminara Environment Setup (Python 3.12.8 - April 2026 Standard)

echo ============================================
echo 🚦 LUMINARA SRE: Environment Check Start
echo ============================================

:: 1. Check/Create Virtual Environment
if not exist ".venv" (
    echo [..] .venv not found. Creating Python 3.12 environment...
    :: We use py -3.12 to be version-explicit
    py -3.12 -m venv .venv
    if !errorlevel! equ 0 (
        echo [OK] .venv created successfully.
    ) else (
        echo [!] FAILED to create .venv. Ensure Python 3.12.8 is installed.
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
    python --version
) else (
    echo [!] FAILED to activate environment.
    pause
    exit /b 1
)

:: 3. Python Dependencies
echo [..] Installing Core AI Engine (PyTorch 2.6.0 for 3.12)...
call python -m pip install --upgrade pip >nul
:: Updated to 2.6.0 to match our new requirements list
call python -m pip install torch>=2.6.0 --index-url https://download.pytorch.org/whl/cu124
if !errorlevel! equ 0 (
    echo [OK] PyTorch 2.6.0 Engine installed.
) else (
    echo [!] FAILED to install Torch.
    pause
    exit /b 1
)

echo [..] Installing 2026 dependencies (langchain 0.4.2, playwright 1.59.1, etc.)...
call python -m pip install -r requirements.txt
if !errorlevel! equ 0 (
    echo [OK] All Python dependencies synchronized.
) else (
    echo [!] Installation failed. Please check requirements.txt syntax.
    pause
    exit /b 1
)

:: 4. Node.js Packages (pnpm)
echo [..] Checking pnpm Node.js packages (Node 24)...
call pnpm install
if !errorlevel! equ 0 (
    echo [OK] pnpm workspace packages are synchronized.
) else (
    echo [!] FAILED pnpm install. Ensure Node 24 is active.
    pause
    exit /b 1
)

:: 5. Playwright Browser Check (v1.58.0 Stable)
echo [..] Checking Chrome for Testing binaries...
call npx playwright install --with-deps chromium
if !errorlevel! equ 0 (
    echo [OK] Playwright 1.58.0 is ready for auditing.
) else (
    echo [!] FAILED to install Playwright binaries.
)

echo ============================================
echo ✅ LUMINARA SETUP COMPLETE: Ready to code!
echo ============================================
pause