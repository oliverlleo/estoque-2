
from playwright.sync_api import sync_playwright

def verify_filtering():
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

        # Find a card with non-zero cost
        cards = page.locator(".obra-card")
        count = cards.count()

        target_card_index = -1
        for i in range(count):
            card = cards.nth(i)
            cost_text = card.locator(".obra-custo").inner_text()
            if "0,00" not in cost_text:
                target_card_index = i
                break

        if target_card_index == -1:
            target_card_index = 0

        print(f"Clicking card {target_card_index}...")
        with page.expect_navigation():
            cards.nth(target_card_index).locator(".btn-ver-mais").click()

        # Check for error or success
        try:
            page.wait_for_selector("#obra-titulo", timeout=5000)
            page.wait_for_function("document.getElementById('obra-titulo').textContent !== 'Carregando...'", timeout=10000)
        except Exception as e:
            print(f"Error waiting for title: {e}")
            # Check if body has error
            content = page.content()
            if "Erro ao carregar dados" in content:
                print("Page Loaded with Error!")
                # Extract error message if possible
                print(page.locator("p").inner_text())
            else:
                print("Page stuck on loading or other issue.")
            browser.close()
            return

        initial_items = page.locator("#detalhe-obra-table-body tr").count()
        print(f"Initial Items Count: {initial_items}")

        # Open Data View
        page.wait_for_selector("#toggle-label-dados")
        page.click("#toggle-label-dados")
        page.wait_for_timeout(1000)

        rows = page.locator("#financial-details-body tr")
        rows_count = rows.count()

        # Find a row with Realizado > 0
        target_row_index = -1
        target_category_name = ""

        for i in range(rows_count):
            row = rows.nth(i)
            if "TOTAL" in row.inner_text():
                continue
            realizado_text = row.locator("td").nth(5).inner_text()
            if "0,00" not in realizado_text:
                target_row_index = i
                target_category_name = row.locator("td").nth(0).inner_text()
                print(f"Found Category Row {i}: {target_category_name} with Realizado {realizado_text}")
                break

        if target_row_index != -1:
            rows.nth(target_row_index).click()
            page.wait_for_timeout(1000)

            filtered_count = page.locator("#detalhe-obra-table-body tr").count()
            print(f"Items after filter: {filtered_count}")

            if filtered_count > 0:
                first_group = page.locator("#detalhe-obra-table-body tr").nth(0).locator("td").nth(5).inner_text()
                print(f"First Item Group: {first_group}")
                if first_group == target_category_name:
                    print("SUCCESS")
                else:
                    print("FAILURE: Mismatch")
            else:
                print("FAILURE: Should have items but found 0.")
        else:
            print("No category with realized cost > 0 found on this project.")

        # Take screenshot
        page.screenshot(path="verification/filtering_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_filtering()
