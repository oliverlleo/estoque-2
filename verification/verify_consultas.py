from playwright.sync_api import sync_playwright

def verify_consultas():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            print("Navigating to Consultas page...")
            page.goto("http://localhost:8000/consultas.html")

            # Wait for table to be visible
            print("Waiting for table...")
            page.wait_for_selector("#table-consultas", timeout=10000)

            # Take a screenshot
            print("Taking screenshot...")
            page.screenshot(path="verification/consultas.png")

            print("Verification script finished successfully.")
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_consultas()
