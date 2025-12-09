from playwright.sync_api import sync_playwright

def verify_consultas(page):
    # Go to consultas page
    page.goto("http://localhost:8000/consultas.html")

    # Wait for table to load
    page.wait_for_selector("#table-consultas tbody tr.main-row")

    # Click the first row to open the modal
    page.click("#table-consultas tbody tr.main-row:first-child")

    # Wait for modal to appear
    page.wait_for_selector("#history-modal", state="visible")

    # Take screenshot of the modal
    page.screenshot(path="verification/consultas_modal.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_consultas(page)
        finally:
            browser.close()
