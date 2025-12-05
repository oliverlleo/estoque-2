from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Verify Consultas Toggle
        print("Verifying Consultas...")
        page.goto("http://localhost:8000/consultas.html")
        # Wait for the toggle CONTAINER or SLIDER since input is hidden opacity:0
        page.wait_for_selector(".toggle-switch", state="visible")

        # Default state: Product
        page.screenshot(path="verification/verify_consultas_produto.png")

        # Toggle to Locacao
        page.click(".slider")
        page.wait_for_selector("#filters-locacao", state="visible")
        page.wait_for_selector("#table-locacao-mode", state="visible")
        page.screenshot(path="verification/verify_consultas_locacao.png")

        # 2. Verify Etiquetas Locacao
        print("Verifying Etiquetas Locacao...")
        page.goto("http://localhost:8000/etiquetas-locacao.html")
        page.wait_for_selector(".controls")
        # Check if select exists
        page.wait_for_selector("#select-local")
        page.screenshot(path="verification/verify_etiquetas_locacao.png")

        # 3. Verify Scan Location (Mobile View)
        print("Verifying Mobile Scan...")
        # Mock short id if possible, but for now just check layout with invalid ID
        page.set_viewport_size({"width": 375, "height": 667})
        page.goto("http://localhost:8000/scan_location.html?q=TESTID")
        # Should show error or loading
        page.wait_for_selector("#error-screen", state="visible") # Since ID is invalid
        page.screenshot(path="verification/verify_scan_mobile.png")

        browser.close()

if __name__ == "__main__":
    verify_changes()
