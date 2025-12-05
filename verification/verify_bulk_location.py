from playwright.sync_api import sync_playwright

def verify_bulk_location_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # 1. Navigate to the page
        page.goto("http://localhost:8000/produtos.html")
        page.wait_for_selector("#form-title")

        # Wait a bit for JS to load (since it's module based)
        page.wait_for_timeout(2000)

        # 2. Open the "Ações em Lote" dropdown
        dropdown_btn = page.locator(".dropdown .btn").first
        dropdown_btn.click()

        # 3. Force click the button even if it thinks it's hidden (it should be visible now though)
        # Or wait for it to be visible
        btn = page.locator("#btn-bulk-add-location")
        # Try force click if visibility check fails, but let's try to wait first
        try:
            btn.wait_for(state="visible", timeout=2000)
            btn.click()
        except:
            print("Button not visible, forcing click...")
            # If standard click fails, we can try to force it or click via JS
            page.evaluate("document.getElementById('btn-bulk-add-location').click()")

        # 4. Verify modal is visible
        modal = page.locator("#bulk-location-modal")
        modal.wait_for(state="visible")

        # 5. Type some product codes
        page.fill("#bulk-location-codes", "PROD001\nPROD002\nINVALIDO")

        # 6. Click Verify
        page.click("#btn-check-bulk-location")

        # 7. Wait for results
        page.wait_for_selector("#bulk-location-results-container", state="visible")

        # 8. Take screenshot
        page.screenshot(path="verification/verification_bulk_location.png")

        browser.close()

if __name__ == "__main__":
    verify_bulk_location_modal()
