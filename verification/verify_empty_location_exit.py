import time
from playwright.sync_api import sync_playwright, expect

def test_empty_location_exit():
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
            # 1. Create a Product
            print("Creating product...")
            page.goto("http://localhost:8000/produtos.html")

            page.fill("#produto-codigo", "TEST-EMPTY-LOC-FIX")
            page.fill("#produto-descricao", "Test Empty Loc Product Fix")
            page.fill("#produto-un", "UN")

            page.wait_for_timeout(2000)
            if page.locator("#produto-fornecedor option").count() > 1:
                page.select_option("#produto-fornecedor", index=1)
            if page.locator("#produto-grupo option").count() > 1:
                page.select_option("#produto-grupo", index=1)

            # Add named location
            page.click("#btn-add-locacao")
            row1 = page.locator(".locacao-row").first
            row1.locator(".locacao-input").fill("A-01")
            row1.locator(".local-select").select_option(index=1)

            # Add empty location
            page.click("#btn-add-locacao")
            row2 = page.locator(".locacao-row").nth(1)
            row2.locator(".locacao-input").fill("")
            row2.locator(".local-select").select_option(index=1)

            page.click("button[type='submit']")
            page.wait_for_timeout(2000)

            # 2. Add Stock to Empty Location
            print("Adding stock...")
            page.goto("http://localhost:8000/movimentacoes.html")
            page.wait_for_timeout(3000)

            if not page.is_checked("#movement-toggle"):
                page.click(".slider")
                page.wait_for_timeout(500)

            page.fill("#mov-produto-search", "TEST-EMPTY-LOC-FIX")
            page.click("#mov-produto-results .search-result-item:first-child")

            page.wait_for_timeout(1000)
            local_select = page.locator("#mov-local")
            local_select.select_option(index=1)

            locacao_select = page.locator("#mov-locacao")
            # Select the empty one (last index)
            count = locacao_select.locator("option").count()
            locacao_select.select_option(index=count-1)

            page.fill("#mov-quantidade", "10")
            page.select_option("#mov-tipo-entrada", index=1)

            page.click("#btn-movimentacao")
            page.wait_for_timeout(2000)

            # 3. Perform Exit (Saída)
            print("Performing exit...")
            if page.is_checked("#movement-toggle"):
                page.click(".slider")
                page.wait_for_timeout(500)

            page.fill("#mov-produto-search", "TEST-EMPTY-LOC-FIX")
            page.click("#mov-produto-results .search-result-item:first-child")

            page.wait_for_timeout(1000)
            local_select.select_option(index=1)

            # Select Locacao (Empty one)
            count = locacao_select.locator("option").count()
            locacao_select.select_option(index=count-1)

            page.fill("#mov-quantidade", "5")
            page.select_option("#mov-tipo-saida", index=1)

            page.click("#btn-movimentacao")

            # Wait a bit
            page.wait_for_timeout(2000)

            # Check if we got the success message
            if any("Saída registrada com sucesso" in msg for msg in dialog_messages):
                print("SUCCESS: Exit registered successfully.")
            elif any("obrigatória para saídas" in msg for msg in dialog_messages):
                print("FAILURE: Still asking for location.")
                raise Exception("Bug still present")
            else:
                print("WARNING: Unknown result.")
                print("Dialogs:", dialog_messages)

        except Exception as e:
            print(f"Test failed with exception: {e}")
            page.screenshot(path="verification_empty_loc_failure.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    test_empty_location_exit()
