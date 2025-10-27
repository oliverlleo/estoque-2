
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("http://localhost:8000/movimentacoes.html")
        await page.wait_for_selector("#loading-overlay", state="visible")
        await page.screenshot(path="jules-scratch/verification/loader_visible.png")
        await page.wait_for_selector("#loading-overlay", state="hidden")
        await page.screenshot(path="jules-scratch/verification/loader_hidden.png")
        await browser.close()

asyncio.run(main())
