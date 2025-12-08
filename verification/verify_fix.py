from playwright.sync_api import sync_playwright

def verify_fix():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto("http://localhost:8000/detalhe-produto.html?id=TEST&locId=TEST")

        # Wait for the element to exist in DOM
        page.wait_for_selector("#produto-codigo")

        print("Simulating populated data...")
        page.evaluate("""
            document.getElementById('produto-codigo').textContent = 'COD-001';
            document.getElementById('produto-descricao').textContent = 'Produto Exemplo';

            const img = document.getElementById('produto-imagem-detalhe');
            img.src = "https://via.placeholder.com/300";
            img.style.display = 'inline-block';

            const desc = document.getElementById('produto-descricao-detalhada-detalhe');
            desc.textContent = "DESCRIÇÃO DEVE ESTAR EMBAIXO DAS INFORMAÇÕES DO PRODUTO.";
            desc.style.display = 'block';
        """)

        page.wait_for_timeout(1000)

        # Take screenshot of the card
        element = page.locator(".card")
        element.screenshot(path="verification/verification_fix.png")
        print("Screenshot saved to verification/verification_fix.png")

        browser.close()

if __name__ == "__main__":
    verify_fix()
