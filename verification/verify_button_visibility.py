from playwright.sync_api import sync_playwright

def verify_visibility():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/movimentacoes.html")

        # Wait for the app to initialize
        page.wait_for_selector("#movement-wrapper", state="visible")

        # Initial state: toggle might be unchecked (Saída) or checked (Entrada)?
        # Let's check the toggle
        is_checked = page.is_checked("#movement-toggle")
        print(f"Initial Toggle State: {is_checked} (Entrada? {is_checked})")

        # If checked (Entrada), button should be hidden.
        if is_checked:
            visible = page.is_visible("#btn-bulk-transfer")
            print(f"Entrada mode - Button visible: {visible}")
            if visible: print("FAILURE: Button should be hidden in Entrada mode")

            # Switch to Saída
            page.click(".toggle-switch")
            # Wait for the state to update (mutation or timeout)
            page.wait_for_timeout(500)

            visible = page.is_visible("#btn-bulk-transfer")
            print(f"Switched to Saída - Button visible: {visible}")
            if not visible: print("FAILURE: Button should be visible in Saída mode")

        else:
            # Initial is Saída (unchecked)
            visible = page.is_visible("#btn-bulk-transfer")
            print(f"Saída mode - Button visible: {visible}")
            if not visible: print("FAILURE: Button should be visible in Saída mode")

            # Switch to Entrada
            page.click(".toggle-switch")
            page.wait_for_timeout(500)
            visible = page.is_visible("#btn-bulk-transfer")
            print(f"Switched to Entrada - Button visible: {visible}")
            if visible: print("FAILURE: Button should be hidden in Entrada mode")

        browser.close()

if __name__ == "__main__":
    verify_visibility()
