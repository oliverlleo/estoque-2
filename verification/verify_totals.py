from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # 1. Navigate to the movimentacoes page
    page.goto("http://localhost:8000/movimentacoes.html")

    # Wait for the table to be populated (which also triggers the total updates)
    # Since we can't easily mock the firebase data, we might see empty tables.
    # However, the structure of the totals should be present even if values are 0.

    try:
        page.wait_for_selector("#total-entrada-valor", timeout=5000)
        page.wait_for_selector("#total-saida-valor", timeout=5000)
    except:
        print("Selectors not found or timed out")

    # Take a screenshot of the card header where the totals are
    # We can select the whole card
    card = page.locator(".card").last
    card.screenshot(path="verification/totals_verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
