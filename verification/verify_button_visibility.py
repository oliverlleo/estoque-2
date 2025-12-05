from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Verify Consultas Toggle and Button
        print("Verifying Consultas Button...")
        page.goto("http://localhost:8000/consultas.html")
        page.wait_for_selector(".toggle-switch", state="visible")

        # Toggle to Locacao
        page.click(".slider")
        page.wait_for_selector("#filters-locacao", state="visible")

        # Check for the button
        page.wait_for_selector("a[href='etiquetas-locacao.html']", state="visible")
        page.screenshot(path="verification/verify_button_visibility.png")
        print("Button verified.")

        browser.close()

if __name__ == "__main__":
    verify_changes()
