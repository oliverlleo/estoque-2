from playwright.sync_api import sync_playwright

def verify_sorting():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Verify Movimentacoes
        page.goto("http://localhost:8000/movimentacoes.html")
        page.wait_for_timeout(1000)

        headers = page.locator("th.sortable")
        count = headers.count()
        print(f"Movimentações sortable headers count: {count}")

        if count > 0:
            headers.first.click()
            page.wait_for_timeout(500)
            cls = headers.first.get_attribute("class")
            print(f"Header class after click: {cls}")
            if "sort-asc" in cls or "sort-desc" in cls:
                print("SUCCESS: Movimentações sorting UI active")
            else:
                print("FAILURE: Movimentações sorting UI not active")

        # Verify Reservas
        page.goto("http://localhost:8000/reservas.html")
        page.wait_for_timeout(1000)
        headers = page.locator("th.sortable")
        count = headers.count()
        print(f"Reservas sortable headers count: {count}")

        if count > 0:
            headers.first.click()
            page.wait_for_timeout(500)
            if "sort-asc" in headers.first.get_attribute("class") or "sort-desc" in headers.first.get_attribute("class"):
                print("SUCCESS: Reservas sorting UI active")

        # Take screenshot
        page.screenshot(path="verification/sorting_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_sorting()