from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Verify scan_obra.html
        print("Navigating to scan_obra.html...")
        page.goto("http://localhost:8000/scan_obra.html?id=test_id")

        # Wait for potential JS execution
        page.wait_for_timeout(1000)

        # Force content visible, hide errors
        page.evaluate("document.getElementById('loader').classList.add('hidden')")
        page.evaluate("document.getElementById('error-screen').classList.add('hidden')")
        page.evaluate("document.getElementById('content').classList.remove('hidden')")

        # Verify "Separados" (Default) -> Should have filter
        page.wait_for_timeout(500)
        page.screenshot(path="verification/verify_scan_filter.png")
        print("Screenshot saved to verification/verify_scan_filter.png")

        browser.close()

if __name__ == "__main__":
    verify_changes()
