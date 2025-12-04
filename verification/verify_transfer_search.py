import time
import re
from playwright.sync_api import sync_playwright, expect

def test_transfer_product_search():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            # 1. Create a Product in produtos.html
            print("Creating product...")
            page.goto("http://localhost:8000/produtos.html")

            # Fill form
            page.fill("#produto-codigo", "TEST-SEARCH")
            page.fill("#produto-descricao", "Test Search Product")
            page.fill("#produto-un", "UN")

            # Select required dropdowns (Fornecedor, Grupo)
            page.wait_for_timeout(2000)
            if page.locator("#produto-fornecedor option").count() > 1:
                page.select_option("#produto-fornecedor", index=1)
            else:
                print("Warning: No options for Fornecedor")

            if page.locator("#produto-grupo option").count() > 1:
                page.select_option("#produto-grupo", index=1)
            else:
                print("Warning: No options for Grupo")

            # Submit
            page.on("dialog", lambda dialog: dialog.accept())
            page.click("button[type='submit']")
            page.wait_for_timeout(2000)

            # 2. Verify Search in movimentacoes.html
            print("Verifying search...")
            page.goto("http://localhost:8000/movimentacoes.html")
            page.wait_for_timeout(3000)

            # Ensure we are in Saída mode (toggle off)
            if page.is_checked("#movement-toggle"):
                page.click("#movement-toggle")
                page.wait_for_timeout(500)

            # Open Transfer Modal
            page.click("#btn-transferencia")

            # Type to search
            search_input = page.locator("#transf-produto-search")
            expect(search_input).to_be_visible()
            search_input.fill("TEST-SEARCH")

            # Wait for results
            results = page.locator("#transf-produto-results")
            expect(results).to_be_visible(timeout=5000)

            # Check result content
            result_item = results.locator(".search-result-item").first
            expect(result_item).to_contain_text("TEST-SEARCH")

            # Click result
            result_item.click()

            # Verify selection
            expect(page.locator("#transf-produto-id")).not_to_be_empty()
            # The input value will be "CODE - DESCRIPTION", checking if it contains the code.
            expect(search_input).to_have_value(re.compile("TEST-SEARCH"))

            # Take screenshot
            page.screenshot(path="verification_transfer_search.png")
            print("Verification successful, screenshot saved.")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification_failure.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    test_transfer_product_search()
