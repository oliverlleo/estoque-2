from playwright.sync_api import sync_playwright, expect
import time

def verify_exports(page):
    # Navigate to Consultas page
    page.goto("http://localhost:8000/consultas.html")

    # Wait for the table to load (data is fetched asynchronously)
    # We wait for the table rows to be present
    try:
        page.wait_for_selector("#table-consultas tbody tr.main-row", timeout=10000)
    except:
        print("Table rows not found, checking if page loaded correctly or if empty.")
        # Take a debug screenshot
        page.screenshot(path="verification/debug_load.png")

    # Check if the export buttons are present
    expect(page.locator("#btn-export-excel")).to_be_visible()
    expect(page.locator("#btn-export-pdf")).to_be_visible()

    # Click the PDF export button to open the modal
    page.click("#btn-export-pdf")

    # Verify the modal is visible
    expect(page.locator("#pdf-columns-modal")).to_be_visible()

    # Verify checkboxes are present
    expect(page.locator("#pdf-columns-list input[type='checkbox']")).to_have_count(9) # We defined 9 columns

    # Take a screenshot of the modal
    page.screenshot(path="verification/verification_pdf_modal.png")

    # Close the modal
    page.click("#pdf-columns-modal-close")
    expect(page.locator("#pdf-columns-modal")).not_to_be_visible()

    # Take a screenshot of the main page with export buttons
    page.screenshot(path="verification/verification_consultas_page.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_exports(page)
            print("Verification script finished successfully.")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/failure.png")
        finally:
            browser.close()
