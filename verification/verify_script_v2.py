from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Verify detalhe-obra.html
        print("Navigating to detalhe-obra.html...")
        page.goto("http://localhost:8000/detalhe-obra.html")
        page.wait_for_timeout(2000)

        # Inject dummy data to verify the positions
        # The script `js/detalhe-obra.js` tries to fetch data. Since it fails (no ID or no data),
        # the elements will be empty or default.
        # We manually inject text to confirm the visual layout of the headers.

        page.evaluate("""
            document.getElementById('obra-negociado-total').innerHTML = 'Negociado: TEST_NEGOCIADO';
            document.getElementById('obra-orcamento').innerHTML = 'Orçamento: TEST_ORCAMENTO';
            document.getElementById('obra-custo-total').innerHTML = 'Custo Total: TEST_CUSTO';
            document.getElementById('obra-vendido-total').innerHTML = 'Vendido: TEST_VENDIDO';
        """)

        page.wait_for_timeout(500)
        page.screenshot(path="verification/verify_detalhe_obra_layout.png")
        print("Screenshot saved to verification/verify_detalhe_obra_layout.png")

        # 2. Verify scan_obra.html
        print("Navigating to scan_obra.html...")
        page.goto("http://localhost:8000/scan_obra.html?id=test_id")

        # Force content visible, hide errors
        page.evaluate("""
            document.getElementById('loader').classList.add('hidden');
            document.getElementById('error-screen').classList.add('hidden');
            document.getElementById('content').classList.remove('hidden');
        """)

        # Verify "Separados" (Default) -> Should be Green toggle
        page.wait_for_timeout(500)
        page.screenshot(path="verification/verify_scan_separados_green.png")
        print("Screenshot saved to verification/verify_scan_separados_green.png")

        # Click toggle (use evaluate if click is flaky due to visibility)
        # Using evaluate to simulate click or just changing checkbox state + dispatching event
        page.evaluate("""
            const toggle = document.getElementById('view-toggle');
            toggle.click();
        """)

        # Verify "Pendentes" -> Should be Red toggle
        page.wait_for_timeout(500)
        page.screenshot(path="verification/verify_scan_pendentes_red.png")
        print("Screenshot saved to verification/verify_scan_pendentes_red.png")

        browser.close()

if __name__ == "__main__":
    verify_changes()
