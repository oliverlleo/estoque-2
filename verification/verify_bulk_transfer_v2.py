from playwright.sync_api import sync_playwright
import time

def verify_bulk_transfer_v2():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto("http://localhost:8000/movimentacoes.html")
        page.wait_for_selector("#movement-wrapper", state="visible")

        # 1. Open Bulk Transfer Modal
        # Ensure Saída mode
        if page.is_checked("#movement-toggle"):
            page.click(".toggle-switch")
            page.wait_for_timeout(500)

        page.wait_for_selector("#btn-bulk-transfer", state="visible")
        page.click("#btn-bulk-transfer")

        # 2. Verify Table Headers
        headers = page.locator("#bulk-transfer-table thead th").all_text_contents()
        print(f"Table Headers: {headers}")
        if "Destino" not in headers or "Destino (Local)" in headers:
             print("FAILURE: Table headers not updated correctly.")
        else:
             print("SUCCESS: Table headers updated.")

        # 3. Enter codes
        # Try to find a code from the main table if populated
        page.wait_for_timeout(2000)
        # We can't see main table while modal is open? It is z-indexed below.
        # But DOM is there.

        # Just use a dummy code to verify Row Structure (even if not found, it shows layout)
        # Wait, if not found, it shows a colspan error row.
        # We need a valid product to verify the SELECT input.
        # Let's try to close modal, get code, reopen.

        page.click("#bulk-transfer-modal-close")

        # Get code from main table
        try:
            code = page.locator("#table-movimentacoes tbody tr:first-child td:nth-child(4)").text_content()
            if not code or code == "N/A": raise Exception("No code")
            print(f"Found code: {code}")
        except:
            print("No history found, trying 'PROD001'...")
            code = "PROD001" # Hope this exists or we can't verify the SELECT

        # Reopen
        page.click("#btn-bulk-transfer")
        page.fill("#bulk-codes-input", code)
        page.click("#btn-load-bulk")

        # 4. Verify Row Structure
        page.wait_for_selector("tbody tr")
        row_html = page.locator("#bulk-transfer-table tbody tr").inner_html()

        if "Produto não encontrado" in row_html:
            print("Product not found. Verifying error layout.")
            # Check for colspan
            # If product not found, we can't verify the select.
            # But we can verify the CSS fix for table row display.
        else:
            print("Product found. Verifying Dest Select.")
            count = page.locator(".bulk-dest-select").count()
            if count > 0:
                print("SUCCESS: Destination Select found.")
            else:
                print("FAILURE: Destination Select NOT found.")

        # Screenshot
        page.screenshot(path="verification/verification_bulk_v2_layout.png")

        browser.close()

if __name__ == "__main__":
    verify_bulk_transfer_v2()
