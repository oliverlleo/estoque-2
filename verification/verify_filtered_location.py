from playwright.sync_api import sync_playwright, expect
import time

def verify_filtered_location(page):
    # Navigate to Consultas page
    page.goto("http://localhost:8000/consultas.html")

    # Wait for the table to load
    page.wait_for_selector("#table-consultas tbody tr.main-row", timeout=10000)

    # Take a screenshot to visually inspect if locations with 0 stock are hidden
    # In the screenshot, we should look for the "Locação" column.
    page.screenshot(path="verification/verify_consultas_locacao.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_filtered_location(page)
            print("Verification script finished successfully.")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/failure.png")
        finally:
            browser.close()
