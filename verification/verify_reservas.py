from playwright.sync_api import sync_playwright

def verify_reservas(page):
    # Go to reservas page
    page.goto("http://localhost:8000/reservas.html")

    # Wait for table to load
    page.wait_for_selector("#table-reservas tbody tr")

    # Click the first row (not the button)
    # Ensure there is a row. If not, we can't test.
    # We assume there is data.
    rows = page.locator("#table-reservas tbody tr")
    if rows.count() > 0:
        rows.first.click()

        # Wait for modal to appear
        page.wait_for_selector("#product-image-modal", state="visible")

        # Take screenshot
        page.screenshot(path="verification/reservas_modal.png")
    else:
        print("No reservations found to test.")
        page.screenshot(path="verification/reservas_empty.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_reservas(page)
        finally:
            browser.close()
