import time
from playwright.sync_api import sync_playwright, expect

def test_rename_workflow():
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
            # 1. Create a Product with Named Location
            print("Creating product with Loc-A...")
            page.goto("http://localhost:8000/produtos.html")

            page.fill("#produto-codigo", "TEST-RENAME")
            page.fill("#produto-descricao", "Test Rename Product")
            page.fill("#produto-un", "UN")

            page.wait_for_timeout(2000)
            if page.locator("#produto-fornecedor option").count() > 1:
                page.select_option("#produto-fornecedor", index=1)
            if page.locator("#produto-grupo option").count() > 1:
                page.select_option("#produto-grupo", index=1)

            page.click("#btn-add-locacao")
            row1 = page.locator(".locacao-row").first
            row1.locator(".locacao-input").fill("Loc-A")
            row1.locator(".local-select").select_option(index=1)

            page.click("button[type='submit']")
            page.wait_for_timeout(2000)

            # 2. Add Stock
            print("Adding stock...")
            page.goto("http://localhost:8000/movimentacoes.html")
            page.wait_for_timeout(3000)

            if not page.is_checked("#movement-toggle"):
                page.click(".slider")
                page.wait_for_timeout(500)

            page.fill("#mov-produto-search", "TEST-RENAME")
            page.click("#mov-produto-results .search-result-item:first-child")

            page.wait_for_timeout(2000)
            page.locator("#mov-local").select_option(index=1)

            # Debug options
            options = page.locator("#mov-locacao option").all_inner_texts()
            print(f"Available options for Entrada: {options}")

            page.locator("#mov-locacao").select_option(label="Loc-A")

            page.fill("#mov-quantidade", "10")
            page.select_option("#mov-tipo-entrada", index=1)

            page.click("#btn-movimentacao")
            page.wait_for_timeout(2000)

            # 3. Edit Product: Rename Loc-A to ""
            print("Editing product: Renaming Loc-A to Empty...")
            page.goto("http://localhost:8000/produtos.html")
            page.wait_for_timeout(2000)

            page.fill("#filter-produtos", "TEST-RENAME")
            page.wait_for_timeout(1000)
            # Click checkbox of first row
            page.click("#table-produtos tbody tr:first-child .produto-checkbox")
            page.click("#btn-editar-selecionado")

            # Wait for form
            page.wait_for_timeout(1000)
            # Find the locacao input and clear it
            page.fill(".locacao-input", "")

            page.click("button[type='submit']")
            page.wait_for_timeout(2000)

            # 4. Perform Exit from Empty Location
            print("Performing exit from Empty...")
            page.goto("http://localhost:8000/movimentacoes.html")
            page.wait_for_timeout(3000)

            if page.is_checked("#movement-toggle"):
                page.click(".slider") # Switch to Saída
                page.wait_for_timeout(500)

            page.fill("#mov-produto-search", "TEST-RENAME")
            page.click("#mov-produto-results .search-result-item:first-child")

            page.wait_for_timeout(1000)
            page.locator("#mov-local").select_option(index=1)

            # Select the empty location.
            # In Saída mode, it should be " (Estoque: 10)".
            # It should be the last option (or second option if only one).
            locacao_select = page.locator("#mov-locacao")
            count = locacao_select.locator("option").count()
            # If logic is correct, there should be 2 options: Placeholder and Empty (with stock).
            # If ghost locations exist, there might be more.
            print(f"Option count: {count}")
            locacao_select.select_option(index=count-1)

            page.fill("#mov-quantidade", "5")
            page.select_option("#mov-tipo-saida", index=1)

            page.click("#btn-movimentacao")
            page.wait_for_timeout(2000)

            if any("Saída registrada com sucesso" in msg for msg in dialog_messages):
                print("SUCCESS: Exit registered successfully.")
            elif any("obrigatória para saídas" in msg for msg in dialog_messages):
                print("FAILURE: Bug reproduced (or persisted).")
                raise Exception("Validation Error Triggered")
            else:
                print("WARNING: Unknown result.")

        except Exception as e:
            print(f"Test failed with exception: {e}")
            page.screenshot(path="verification_rename_failure.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    test_rename_workflow()
