from playwright.sync_api import sync_playwright

def verify_mobile_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use mobile viewport
        page = browser.new_page(viewport={"width": 375, "height": 812})

        # Test with a made-up Short ID (This will show error screen, but verifies layout exists)
        # To truly verify modal, we'd need to mock data or have seeded data.
        # Since we can't seed, we check if the elements exist in the DOM structure by inspecting source or if script loaded.

        # We can't easily reach the success state without valid ID.
        # However, we can check if the modal HTML is present and hidden.

        page.goto("http://localhost:8000/scan_location.html?q=TEST")

        # Wait for error screen or content
        try:
             page.wait_for_selector("#error-screen", timeout=2000)
             print("Error screen confirmed (expected for invalid ID).")
        except:
             pass

        # Check for modal existence in DOM
        modal = page.query_selector("#reserva-modal")
        if modal:
            print("Modal element found in DOM.")
        else:
            print("FAIL: Modal element not found.")

        # Check for new Stats Headers
        # Since we are on error screen, content is hidden.
        # We can force show content via JS to verify layout?
        page.evaluate("document.getElementById('content').classList.remove('hidden')")
        page.evaluate("document.getElementById('error-screen').classList.add('hidden')")

        # Now check stats
        reserved_stat = page.query_selector("#total-reserved-items")
        if reserved_stat:
             print("Reserved Items stat element found.")

        page.screenshot(path="verification/verify_scan_mobile.png")
        browser.close()

if __name__ == "__main__":
    verify_mobile_modal()
