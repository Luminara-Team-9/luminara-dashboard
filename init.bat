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

:: 3. Python Dependencies (pip)
echo [..] Checking Python dependencies (requirements.txt)...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
if !errorlevel! equ 0 (
    echo [OK] Python dependencies are synchronized and satisfied.
) else (
    echo [!] FAILED to install Python dependencies. Check requirements.txt.
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