from playwright.sync_api import sync_playwright
import time

def verify_bulk_transfer():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto("http://localhost:8000/movimentacoes.html")

        # 1. Open Bulk Transfer Modal
        page.wait_for_selector("#btn-bulk-transfer")
        page.click("#btn-bulk-transfer")

        # 2. Enter codes
        # Assuming we have some product codes from previous steps.
        # In this env, products are loaded from DB.
        # I'll search for codes in the page source or try to guess/use common ones if I can't find them.
        # Actually, I can check the `productsMap` via console or just assume some exist.
        # Better: Scan the main table if populated, or search via the main search bar first?
        # Let's inspect the `productsMap` via evaluate to get real codes.

        page.wait_for_timeout(2000) # Wait for initial data load

        codes = page.evaluate("() => Object.values(productsMap || {}).map(p => p.codigo).slice(0, 3)")

        if not codes:
            print("No products found to test.")
            return

        print(f"Testing with codes: {codes}")

        input_text = ", ".join(codes) + ", INVALID_CODE_123"
        page.fill("#bulk-codes-input", input_text)

        # 3. Load
        page.click("#btn-load-bulk")

        # 4. Verify Rows
        # Should have 4 rows (3 valid, 1 invalid)
        page.wait_for_selector(".bulk-transfer-row")
        rows = page.locator(".bulk-transfer-row").all()
        print(f"Rows found: {len(rows)}")

        # Check for red row
        red_rows = page.locator("tr[style*='rgb(255, 221, 221)']").count() # #ffdddd
        # Or check content
        invalid_text = page.locator("text=Produto não encontrado").count()
        print(f"Invalid rows detected: {invalid_text}")

        if invalid_text == 0:
            print("FAILURE: Invalid code not highlighted.")

        # 5. Fill Details for first valid row
        first_row = rows[0]
        # Select Origin (assuming first option is valid if stock exists)
        origin_select = first_row.locator(".bulk-origin-select")
        origin_options = origin_select.locator("option").all()
        if len(origin_options) > 1:
            origin_select.select_option(index=1)

        # Select Dest Local
        dest_local_select = first_row.locator(".bulk-dest-local-select")
        dest_local_select.select_option(index=1)

        # Fill Dest Locacao
        first_row.locator(".bulk-dest-locacao-input").fill("1-A-02")

        # Fill Qty
        first_row.locator(".bulk-qty-input").fill("1")

        # Remove invalid row to allow submit
        # The invalid row is the one with "Produto não encontrado".
        # It doesn't have the class .bulk-transfer-row?
        # Wait, my code adds class .bulk-transfer-row to ALL rows?
        # No: `row.className = 'bulk-transfer-row';` is only in the `else` (found) block.
        # The invalid row is created in the `if (!product)` block and does NOT have `bulk-transfer-row` class.
        # But `btn-remove-row` is only added to valid rows in the snippet?
        # Let's check the code snippet.
        # Ah, invalid row:
        # row.innerHTML = `<td>${code}</td><td colspan="6"...>Produto não encontrado</td>`;
        # It has NO delete button in my snippet!
        # "row.style.backgroundColor = '#ffdddd';"
        # So I cannot remove it?
        # And `btnConfirmBulk` iterates `document.querySelectorAll('.bulk-transfer-row')`.
        # So invalid rows are naturally excluded from submission logic because they don't have the class!
        # Good design (accidental or not).

        # 6. Submit
        # Take screenshot before submit
        page.screenshot(path="verification/verification_bulk_filled.png")

        # Handle confirm dialog
        page.on("dialog", lambda dialog: dialog.accept())

        page.click("#btn-confirm-bulk")

        # 7. Verify Success
        # Wait for modal to close
        page.wait_for_selector("#bulk-transfer-modal", state="hidden")

        print("Bulk transfer submitted successfully.")

        # Final screenshot
        page.screenshot(path="verification/verification_bulk_success.png")

        browser.close()

if __name__ == "__main__":
    verify_bulk_transfer()
