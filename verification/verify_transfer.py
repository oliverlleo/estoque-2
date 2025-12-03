
from playwright.sync_api import sync_playwright
import json

def verify_transfer_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the page
        page.goto("http://localhost:8000/movimentacoes.html")

        # Wait for the page to load
        page.wait_for_load_state("networkidle")

        # Click on "Entrada" to ensure we are in the right state (though Transfer is usually visible in Entrada mode? No, wait)
        # In js/movimentacoes.js:
        # btnImportarXml.style.display = isEntrada ? 'inline-block' : 'none';
        # btnTransferencia.style.display = isEntrada ? 'none' : 'inline-block';
        # So Transfer button is visible when isEntrada is FALSE (i.e. SAIDA mode).

        # Default mode: toggle is unchecked?
        # HTML: <input type="checkbox" id="movement-toggle">
        # JS: const isEntrada = toggle.checked;
        # If unchecked, isEntrada is false -> Saida -> Transfer visible.

        # Let's check the toggle state.
        # click on toggle if needed.

        # Wait for "Registrar Movimentação"
        page.wait_for_selector("#movement-wrapper")

        # Check if Transfer button is visible
        transfer_btn = page.locator("#btn-transferencia")
        if not transfer_btn.is_visible():
            print("Transfer button not visible, clicking toggle...")
            page.click("#movement-toggle") # Toggle to Saida if needed?
            # If default is unchecked (Saida), it should be visible.
            # Let's force it to Saida (unchecked).
            is_checked = page.is_checked("#movement-toggle")
            if is_checked:
                 page.click("#movement-toggle")

        page.wait_for_timeout(1000)

        # Click Transfer button
        transfer_btn.click()

        # Wait for modal
        page.wait_for_selector("#transferencia-modal", state="visible")

        # Check products dropdown
        product_select = page.locator("#transf-produto")
        options = product_select.locator("option").all_inner_texts()
        print(f"Found products: {len(options)}")

        if len(options) <= 1:
            print("No products found in dropdown (besides placeholder). Cannot verify.")
            # Verify if we can just manipulate the DOM to fake a product
            # Since we can't easily touch the private scope variables, we might be stuck if DB is empty.

            # Let's try to create a dummy product in the DOM and trigger events?
            # No, the logic looks up `productsMap[productId]`.
            # If productsMap is empty, it won't work.

            pass
        else:
            # Select the first available product
            product_select.select_option(index=1)

            # Wait for origin dropdown to populate
            origin_select = page.locator("#transf-locacao-origem")
            page.wait_for_timeout(500)

            origin_options = origin_select.locator("option").all_inner_texts()
            print("Origin options:", origin_options)

            if len(origin_options) > 1:
                # Select the first origin (that is not placeholder)
                origin_select.select_option(index=1)

                # Check destination dropdown
                dest_select = page.locator("#transf-locacao-destino")
                page.wait_for_timeout(500)

                dest_options = dest_select.locator("option").all_inner_texts()
                print("Destination options:", dest_options)

                # Verify that destination options have the format "Locacao (LocalName)"
                # We expect at least one if there are multiple locations.

                # Take screenshot
                page.screenshot(path="verification_transfer_modal.png")
                print("Screenshot taken.")

            else:
                print("No origin options found.")

        browser.close()

if __name__ == "__main__":
    verify_transfer_modal()
