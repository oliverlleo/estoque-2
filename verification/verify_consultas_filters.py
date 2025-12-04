from playwright.sync_api import sync_playwright

def verify_filters():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/consultas.html")

        # Wait for data load
        page.wait_for_timeout(2000)

        # Check filters existence
        assert page.is_visible("#filter-cor"), "Filter COR not visible"
        assert page.is_visible("#filter-local"), "Filter LOCAL not visible"
        assert page.is_visible("#filter-locacao"), "Filter LOCACAO not visible"
        assert page.is_visible("#filter-com-reserva"), "Filter COM RESERVA not visible"

        print("All filters visible.")

        # Test Filter Local Population (should have options)
        options = page.locator("#filter-local option").all()
        print(f"Local options count: {len(options)}")
        if len(options) <= 1:
            print("WARNING: Local filter options not populated correctly (or no locals in DB)")

        page.screenshot(path="verification/verify_consultas_filters.png")
        browser.close()

if __name__ == "__main__":
    verify_filters()
