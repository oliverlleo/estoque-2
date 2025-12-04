from playwright.sync_api import sync_playwright

def verify_consultas_sorting():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Verify Consultas
        page.goto("http://localhost:8000/consultas.html")
        page.wait_for_timeout(1000)

        headers = page.locator("th.sortable")
        count = headers.count()
        print(f"Consultas sortable headers count: {count}")

        if count > 0:
            headers.first.click()
            page.wait_for_timeout(500)
            cls = headers.first.get_attribute("class")
            print(f"Header class after click: {cls}")
            if "sort-asc" in cls or "sort-desc" in cls:
                print("SUCCESS: Consultas sorting UI active")
            else:
                print("FAILURE: Consultas sorting UI not active")

        # Take screenshot
        page.screenshot(path="verification/consultas_sorting_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_consultas_sorting()
