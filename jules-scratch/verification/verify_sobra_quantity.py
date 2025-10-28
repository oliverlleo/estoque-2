
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            # Navigate to the page
            await page.goto("http://localhost:8000/movimentacoes.html")

            # Wait for the loading overlay to disappear
            await page.wait_for_selector("#loading-overlay", state="hidden")

            # Click on the product search input
            await page.click("#mov-produto-search")

            # Type "sobra" to filter for leftover products
            await page.fill("#mov-produto-search", "sobra")

            # Wait for the search results to appear
            await page.wait_for_selector(".search-result-item")

            # Click on the first search result to select a "sobra" product
            await page.click(".search-result-item")

            # Take a screenshot to verify the quantity field is enabled
            await page.screenshot(path="jules-scratch/verification/sobra_quantity_field_enabled.png")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
