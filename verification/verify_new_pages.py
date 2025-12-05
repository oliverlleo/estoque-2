from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Verifying Consultas page...")
        try:
            page.goto("http://localhost:8000/consultas.html")
            # Wait for the slider which is visible, not the checkbox
            page.wait_for_selector(".slider")

            # Switch to Locacao mode
            page.click(".slider")
            page.wait_for_timeout(500) # Wait for UI update

            # Check if locacao filters are visible
            loc_input = page.is_visible("#filter-locacao-mode-input")
            if loc_input:
                print("Consultas: Toggle switch and Location input visible.")
            else:
                print("Consultas: FAILED - Location input not visible.")

            page.screenshot(path="verification/verify_consultas_fixed.png")
            print("Consultas screenshot saved.")

        except Exception as e:
            print(f"Consultas Error: {e}")

        browser.close()

if __name__ == "__main__":
    verify_changes()
