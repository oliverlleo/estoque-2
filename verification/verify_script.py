from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Verify detalhe-obra.html
        print("Navigating to detalhe-obra.html...")
        page.goto("http://localhost:8000/detalhe-obra.html")
        page.wait_for_timeout(2000) # Wait for page load (mock data might be needed if it relies on ID)

        # Take screenshot of header to verify financial stats order
        page.screenshot(path="verification/verify_detalhe_obra.png")
        print("Screenshot saved to verification/verify_detalhe_obra.png")

        # 2. Verify scan_obra.html
        # We need a mock ID to load the page properly without error screen,
        # but the JS checks for ID. Let's try to append ?id=test
        print("Navigating to scan_obra.html...")
        page.goto("http://localhost:8000/scan_obra.html?id=test_id")

        # We need to simulate the UI state.
        # The JS fetches data. Since we don't have real data, we might see the loading screen or error.
        # However, we can inject styles or inspect the toggle color directly if we force the element visibility.
        # Or better, we can mock the network response if needed, but for color check:
        # The CSS is loaded. The toggle is there.

        # Let's wait a bit.
        page.wait_for_timeout(2000)

        # If error screen shows up, we might not see the toggle.
        # The toggle is in the header which is #header-obra inside #content.
        # #content is hidden by default.
        # We can force #content to be visible and #error-screen to be hidden via script injection for verification purposes.

        page.evaluate("""
            document.getElementById('loader').classList.add('hidden');
            document.getElementById('error-screen').classList.add('hidden');
            document.getElementById('content').classList.remove('hidden');
        """)

        # Take screenshot of "Separados" state (default) -> Should be Green
        page.screenshot(path="verification/verify_scan_obra_separados.png")
        print("Screenshot saved to verification/verify_scan_obra_separados.png")

        # Click toggle to switch to "Pendentes"
        page.click("#view-toggle")
        page.wait_for_timeout(500)

        # Take screenshot of "Pendentes" state -> Should be Red
        page.screenshot(path="verification/verify_scan_obra_pendentes.png")
        print("Screenshot saved to verification/verify_scan_obra_pendentes.png")

        browser.close()

if __name__ == "__main__":
    verify_changes()
