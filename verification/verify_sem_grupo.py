
from playwright.sync_api import sync_playwright

def verify_sem_grupo_consolidation():
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

        page.wait_for_selector("#toggle-label-dados")
        page.click("#toggle-label-dados")
        page.wait_for_timeout(1000)

        rows = page.locator("#financial-details-body tr")
        count = rows.count()
        print(f"Total Rows: {count}")

        sem_grupo_count = 0
        zero_val_count = 0

        for i in range(count):
            row = rows.nth(i)
            text = row.inner_text()
            if "Sem Grupo/Outros" in text:
                sem_grupo_count += 1

            cols = row.locator("td")
            # If columns are missing (e.g. empty row), skip
            if cols.count() < 6:
                continue

            val1 = cols.nth(1).inner_text()
            val2 = cols.nth(3).inner_text()
            val3 = cols.nth(5).inner_text()

            if "0,00" in val1 and "0,00" in val2 and "0,00" in val3:
                print(f"Row {i} has all zeros: {text}")
                zero_val_count += 1

        print(f"Sem Grupo Rows: {sem_grupo_count}")
        print(f"Zero Value Rows: {zero_val_count}")

        if sem_grupo_count > 1:
            print("FAILURE: Multiple Sem Grupo rows found.")
        elif zero_val_count > 0:
             print("FAILURE: Rows with all zero values found.")
        else:
            print("SUCCESS: Table is clean.")

        browser.close()

if __name__ == "__main__":
    verify_sem_grupo_consolidation()
