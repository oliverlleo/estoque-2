from playwright.sync_api import sync_playwright

def verify_reservation_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to Reservas page
        page.goto("http://localhost:8000/reservas.html")

        # We need to simulate opening the modal
        # Since we don't have DB data in this static server context easily,
        # we'll use evaluate to forcefully show the modal and populate it with dummy data

        page.evaluate("""
            const modal = document.getElementById('reservation-confirm-modal');
            modal.style.display = 'flex';
            modal.classList.remove('hidden');

            document.getElementById('res-modal-produto').textContent = 'PRODUTO TESTE 123 - PARAFUSO HEXAGONAL';
            document.getElementById('res-modal-quantidade-original').textContent = '10';
            document.getElementById('res-modal-quantidade-input').value = '10';

            const select = document.getElementById('res-modal-locacao-select');
            const opt1 = document.createElement('option');
            opt1.text = 'A-01 (Galpão Principal) - Estoque: 50';
            select.add(opt1);
            const opt2 = document.createElement('option');
            opt2.text = 'B-02 (Depósito Externo) - Estoque: 20';
            select.add(opt2);
        """)

        # Wait a bit for rendering
        page.wait_for_timeout(1000)

        # Take screenshot
        page.screenshot(path="verification/verification_modal_debug.png")

        browser.close()

if __name__ == "__main__":
    verify_reservation_modal()
