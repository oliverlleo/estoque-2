
import asyncio
from playwright.async_api import async_playwright, expect
import re

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Verify movimentacoes.html
        await page.goto("http://localhost:8000/movimentacoes.html")
        await page.wait_for_selector("#table-movimentacoes tbody tr", state="visible", timeout=10000)

        # Find a numeric cell that is not '-'
        all_cells = await page.locator("#table-movimentacoes tbody tr td:nth-child(9)").all()
        numeric_cell = None
        for cell in all_cells:
            cell_text = await cell.text_content()
            if cell_text != '-':
                numeric_cell = cell
                break

        if not numeric_cell:
            print("No numeric cells found in movimentacoes.html to verify formatting. Skipping.")
        else:
            await expect(numeric_cell).to_contain_text(",")

        await page.screenshot(path="jules-scratch/verification/movimentacoes-formatting.png")

        # Verify consultas.html
        await page.goto("http://localhost:8000/consultas.html")
        await page.wait_for_selector("#table-consultas tbody tr", state="visible", timeout=10000)

        # Find a numeric cell that is not '-'
        all_cells = await page.locator("#table-consultas tbody tr td:nth-child(7)").all()
        numeric_cell = None
        for cell in all_cells:
            cell_text = await cell.text_content()
            if cell_text != '-':
                numeric_cell = cell
                break

        if not numeric_cell:
            print("No numeric cells found in consultas.html to verify formatting. Skipping.")
        else:
            await expect(numeric_cell).to_contain_text(",")


        await page.screenshot(path="jules-scratch/verification/consultas-formatting.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
