import os
import sys
from playwright.sync_api import sync_playwright

# Pull the dynamic port injected by the GitHub Action environment
twin_port = os.environ.get("TWIN_PORT")

if not twin_port:
    print("❌ ERROR: TWIN_PORT environment variable is not set.")
    sys.exit(1)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page()
        
        # Intercept console logs and runtime exceptions from the browser
        page.on("console", lambda msg: print(f"🌐 BROWSER LOG [{msg.type}]: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"🚨 BROWSER RUNTIME ERROR: {exc}"))
        
        print(f"Connecting to http://127.0.0.1:{twin_port}...")
        page.goto(f"http://127.0.0.1:{twin_port}", timeout=60000)
        
        # Save visual state
        page.screenshot(path="debug_view.png")
        print("✅ Emergency debug screenshot saved to debug_view.png")
        
        browser.close()
except Exception as e:
    print(f"❌ Playwright diagnostic failed: {e}")
    sys.exit(0) # Prevent crashing the cleanup steps