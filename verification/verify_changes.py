from playwright.sync_api import sync_playwright

def verify_product_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to Produtos page
        page.goto("http://localhost:8000/produtos.html")
        page.wait_for_timeout(2000)

        # 1. Verify New Fields in Form
        print("Verifying new form fields...")
        page.wait_for_selector("#produto-imagem")
        page.wait_for_selector("#produto-descricao-detalhada")

        # Fill the form to verify they accept input
        page.fill("#produto-imagem", "https://via.placeholder.com/150")
        page.fill("#produto-descricao-detalhada", "Teste de descrição detalhada.")

        # Take screenshot of the form
        page.screenshot(path="verification/form_fields.png")
        print("Form fields verified. Screenshot saved to verification/form_fields.png")

        # 2. Verify View Modal Design
        # Since we can't easily mock the module-scoped data to trigger the click event naturally,
        # we will programmatically populate and show the modal to verify its design.

        print("Manually triggering modal for visual verification...")
        page.evaluate("""
            const modal = document.getElementById('view-product-modal');
            const img = document.getElementById('view-product-image');
            const desc = document.getElementById('view-product-description');
            const title = document.getElementById('view-product-title');

            title.textContent = "PROD-TEST - Produto de Teste";
            img.src = "https://via.placeholder.com/300";
            img.style.display = "block";
            desc.textContent = "Esta é uma descrição detalhada de exemplo.\\nEla deve estar em um fundo escuro com texto claro.";

            modal.style.display = 'block';
        """)

        page.wait_for_selector("#view-product-modal", state="visible")
        page.wait_for_timeout(1000) # Wait for render

        page.screenshot(path="verification/view_modal_design.png")
        print("View modal design verified. Screenshot saved to verification/view_modal_design.png")

        browser.close()

if __name__ == "__main__":
    verify_product_changes()
