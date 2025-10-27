
import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Navigate to the product details page
        await page.goto('http://localhost:8000/detalhe-produto.html?id=someproduct')

        # Mock data for leftovers
        mock_sobras_data = [
            {
                "codigo": "PROD-001-S1200",
                "medida_sobra": "1200",
                "un": "mm",
                "locacoes": [
                    {
                        "locacao": "1-A-01-A",
                        "localId": "someLocalId",
                        "estoque": 10
                    }
                ]
            },
            {
                "codigo": "PROD-001-S800",
                "medida_sobra": "800",
                "un": "mm",
                "locacoes": [
                    {
                        "locacao": "2-B-02-B",
                        "localId": "someLocalId",
                        "estoque": 5
                    }
                ]
            }
        ]

        # Wait for the description element to be visible
        await expect(page.locator('#produto-descricao')).to_be_visible()

        # Open the modal by clicking on the description
        await page.locator('#produto-descricao').click()

        # Inject the mock data into the sobrasData array and render it
        await page.evaluate(f'''
            let sobrasData = {mock_sobras_data};
            let configData = {{
                locais: {{ "someLocalId": {{ "nome": "PERFECTA" }} }}
            }};
            renderSobras(sobrasData);
        ''')

        # Wait for the modal to be visible
        await expect(page.locator('#sobras-modal')).to_be_visible()

        # Simulate typing in the search bar
        await page.locator('#sobra-search-input').type('1200')

        # Add a small delay to allow the DOM to update
        await page.wait_for_timeout(500)

        # Take a screenshot
        await page.screenshot(path='jules-scratch/verification/verification.png')

        await browser.close()

asyncio.run(main())
