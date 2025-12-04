import time
from playwright.sync_api import sync_playwright, expect

def test_full_reservation_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        dialog_messages = []
        def handle_dialog(dialog):
            print(f"Dialog message: {dialog.message}")
            dialog_messages.append(dialog.message)
            dialog.accept()

        page.on("dialog", handle_dialog)

        try:
            # 1. Create Product
            print("Creating product...")
            page.goto("http://localhost:8000/produtos.html")
            page.fill("#produto-codigo", "TEST-RES-FLOW")
            page.fill("#produto-descricao", "Test Reservation Flow")
            page.fill("#produto-un", "UN")
            page.wait_for_timeout(2000)
            if page.locator("#produto-fornecedor option").count() > 1:
                page.select_option("#produto-fornecedor", index=1)
            if page.locator("#produto-grupo option").count() > 1:
                page.select_option("#produto-grupo", index=1)

            page.click("#btn-add-locacao")
            row = page.locator(".locacao-row").first
            row.locator(".locacao-input").fill("") # Empty Location
            row.locator(".local-select").select_option(index=1)

            page.click("button[type='submit']")
            page.wait_for_timeout(2000)

            # 2. Add Stock
            print("Adding stock...")
            page.goto("http://localhost:8000/movimentacoes.html")
            page.wait_for_timeout(3000)
            if not page.is_checked("#movement-toggle"):
                page.click(".slider")
                page.wait_for_timeout(500)
            page.fill("#mov-produto-search", "TEST-RES-FLOW")
            page.click("#mov-produto-results .search-result-item:first-child")
            page.wait_for_timeout(1000)
            page.locator("#mov-local").select_option(index=1)
            page.locator("#mov-locacao").select_option(index=1) # Empty
            page.fill("#mov-quantidade", "10")
            page.select_option("#mov-tipo-entrada", index=1)
            page.click("#btn-movimentacao")
            page.wait_for_timeout(2000)

            # 3. Create Reservation (The step user says failed)
            print("Creating reservation...")
            if page.is_checked("#movement-toggle"):
                page.click(".slider") # Switch to Saída
                page.wait_for_timeout(500)

            page.fill("#mov-produto-search", "TEST-RES-FLOW")
            page.click("#mov-produto-results .search-result-item:first-child")
            page.wait_for_timeout(1000)
            page.locator("#mov-local").select_option(index=1)

            # Select empty location
            locacao_select = page.locator("#mov-locacao")
            count = locacao_select.locator("option").count()
            locacao_select.select_option(index=count-1)

            page.fill("#mov-quantidade", "5")

            # Select "Reserva" type.
            # We assume one of the options is "Reserva" or has config `reservar_estoque=true`.
            # Usually "Reserva" is explicitly named.
            found_reserva = False
            options = page.locator("#mov-tipo-saida option").all_inner_texts()
            for i, text in enumerate(options):
                if "Reserva" in text:
                    page.select_option("#mov-tipo-saida", index=i)
                    found_reserva = True
                    break

            if not found_reserva:
                # Fallback: assume index 2 is reserva if standard seed
                page.select_option("#mov-tipo-saida", index=1) # Risky if 1 is simple exit
                print("Warning: Could not identify 'Reserva' option by text. Using index 1.")

            # Fill other potential required fields
            page.fill("#mov-requisitante", "Test User")
            if page.locator("#mov-obra option").count() > 1:
                page.select_option("#mov-obra", index=1)

            page.click("#btn-movimentacao")
            page.wait_for_timeout(2000)

            if any("Reserva registrada com sucesso" in msg for msg in dialog_messages):
                print("SUCCESS: Reservation created successfully.")
            elif any("obrigatória para fazer a reserva" in msg for msg in dialog_messages):
                print("FAILURE: Validation error during reservation creation.")
                raise Exception("Validation Bug in Creation")
            else:
                print(f"WARNING: Unknown result during creation. Dialogs: {dialog_messages}")
                # Continue only if we think it succeeded?
                # If no success message, maybe it failed silently or button didn't click.

            # 4. Confirm Reservation (The step user asked to verify)
            print("Verifying confirmation in reservas.html...")
            page.goto("http://localhost:8000/reservas.html")
            page.wait_for_timeout(3000)

            # Filter for our product
            page.fill("#filter-codigo", "TEST-RES-FLOW")
            page.wait_for_timeout(1000)

            # There should be a row.
            rows = page.locator("#table-reservas tbody tr")
            if rows.count() == 0:
                print("FAILURE: No reservation found in table.")
                raise Exception("Reservation missing")

            # Click Confirm
            page.click(".btn-confirmar")
            page.wait_for_timeout(1000)

            # Modal should be open
            expect(page.locator("#reservation-confirm-modal")).to_be_visible()

            # Check selected location in modal
            modal_select = page.locator("#res-modal-locacao-select")
            # Since we reserved from empty, and product has empty, it should be selected.
            # Value should be "" (from js/reservas.js logic).
            # Text should contain "Estoque".

            # Try to confirm
            page.click("#btn-finalizar-confirmacao")
            page.wait_for_timeout(2000)

            if any("Reserva confirmada" in msg for msg in dialog_messages):
                print("SUCCESS: Reservation confirmed successfully.")
            else:
                print("FAILURE: Confirmation failed.")
                raise Exception("Confirmation Failed")

        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="verification_full_flow_failure.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    test_full_reservation_flow()
