from playwright.sync_api import sync_playwright
import time

def verify_global_search():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/index.html")
        page.wait_for_timeout(3000)
        search_input = page.locator("#global-search")
        search_input.wait_for(state="visible")

        # Check if we can type and see results (mock check via screenshot)
        search_input.fill("nova")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/search_fix_check.png")
        browser.close()

if __name__ == "__main__":
    verify_global_search()
