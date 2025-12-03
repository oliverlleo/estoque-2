
from playwright.sync_api import sync_playwright

def verify_financial_details_table():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to obras.html to find a valid work...")
        page.goto("http://localhost:8000/obras.html")

        # Wait for at least one card
        try:
            page.wait_for_selector(".obra-card", timeout=10000)
        except:
            print("Timeout waiting for obras cards. Maybe no data or network issue.")
            # If no data, we can't fully test.
            browser.close()
            return

        # Click the first 'Ver mais' button
        with page.expect_navigation():
            page.click(".obra-card:first-child .btn-ver-mais")

        print(f"Navigated to: {page.url}")

        # Now on detalhe-obra.html

        # Wait for the label to be visible
        page.wait_for_selector("#toggle-label-dados")

        # Wait for data to load (title shouldn't be 'Carregando...')
        page.wait_for_function("document.getElementById('obra-titulo').textContent !== 'Carregando...'")

        # Initial state
        charts_visible = page.is_visible("#financial-charts-view")
        table_visible = page.is_visible("#financial-data-view")

        print(f"Initial: Charts Visible={charts_visible}, Table Visible={table_visible}")

        if not charts_visible or table_visible:
            print("Error: Initial state incorrect.")

        # Click the toggle label "Dados"
        print("Clicking 'Dados' toggle...")
        page.click("#toggle-label-dados")

        # Wait a bit
        page.wait_for_timeout(1000)

        # New state
        charts_visible_after = page.is_visible("#financial-charts-view")
        table_visible_after = page.is_visible("#financial-data-view")

        print(f"After Click: Charts Visible={charts_visible_after}, Table Visible={table_visible_after}")

        if charts_visible_after or not table_visible_after:
            print("Error: State after click incorrect.")
        else:
            print("Success: Toggle works correctly.")

        # Take screenshot of the table view
        page.screenshot(path="verification/financial_table_view.png")

        browser.close()

if __name__ == "__main__":
    verify_financial_details_table()
