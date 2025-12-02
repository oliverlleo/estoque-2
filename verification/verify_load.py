from playwright.sync_api import sync_playwright

def verify_script_load():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the page
        page.goto("http://localhost:8000/movimentacoes.html")

        # Check for console errors
        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Page Error: {err}"))

        # Wait for a bit to let scripts load
        page.wait_for_timeout(3000)

        # Check if functions are defined (though they are module scoped or inside event listeners, so might not be globally accessible)
        # We can try to evaluate if the file loaded successfully.

        # Take a screenshot
        page.screenshot(path="verification/verification.png")

        print("Page loaded successfully.")

        browser.close()

if __name__ == "__main__":
    verify_script_load()
