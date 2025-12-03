
from playwright.sync_api import sync_playwright

def verify_clear_filter():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to obras.html...")
        page.goto("http://localhost:8000/obras.html")

        try:
            page.wait_for_selector(".obra-card", timeout=10000)
        except:
            print("Timeout waiting for cards.")
            browser.close()
            return

        # Use a card with data (index 3 based on previous runs)
        # Assuming index 3 has non-zero cost
        cards = page.locator(".obra-card")
        target_card_index = 0
        for i in range(cards.count()):
            if "0,00" not in cards.nth(i).locator(".obra-custo").inner_text():
                target_card_index = i
                break

        print(f"Clicking card {target_card_index}...")
        with page.expect_navigation():
            cards.nth(target_card_index).locator(".btn-ver-mais").click()

        page.wait_for_selector("#obra-titulo")
        page.wait_for_function("document.getElementById('obra-titulo').textContent !== 'Carregando...'", timeout=10000)

        initial_items = page.locator("#detalhe-obra-table-body tr").count()
        print(f"Initial Items Count: {initial_items}")

        # Open Data View
        page.wait_for_selector("#toggle-label-dados")
        page.click("#toggle-label-dados")
        page.wait_for_timeout(1000)

        rows = page.locator("#financial-details-body tr")

        # 1. Select a category
        target_row_index = -1
        for i in range(rows.count()):
            row = rows.nth(i)
            if "TOTAL" in row.inner_text():
                continue
            if "0,00" not in row.locator("td").nth(5).inner_text():
                target_row_index = i
                break

        if target_row_index == -1:
            print("No suitable row found for testing selection.")
            target_row_index = 0

        print(f"Selecting row {target_row_index}...")
        rows.nth(target_row_index).click()
        page.wait_for_timeout(500)

        # Verify Highlight
        if "bg-blue-50" in rows.nth(target_row_index).get_attribute("class"):
            print("Row highlighted.")
        else:
            print("Row NOT highlighted (Problem!).")

        # Verify Items filtered? (Optional, assumed working from previous task)

        # 2. Click TOTAL row to clear
        print("Clicking TOTAL row...")
        total_row = page.locator("#financial-details-footer tr")
        total_row.click()
        page.wait_for_timeout(500)

        # Verify Highlight Removed
        if "bg-blue-50" not in rows.nth(target_row_index).get_attribute("class"):
            print("Row highlight removed correctly.")
        else:
            print("Row STILL highlighted (Failure).")

        final_items = page.locator("#detalhe-obra-table-body tr").count()
        print(f"Final Items Count: {final_items}")

        if final_items == initial_items:
            print("Items count restored to initial.")
        else:
            print(f"Items count mismatch (Expected {initial_items}, got {final_items}).")

        # Take screenshot
        page.screenshot(path="verification/verify_clear_filter.png")

        browser.close()

if __name__ == "__main__":
    verify_clear_filter()
