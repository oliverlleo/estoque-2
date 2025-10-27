
import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Navigate to the product details page
        await page.goto('http://localhost:8000/detalhe-produto.html?id=someproduct')

        # Mock product data
        mock_product_data = {
            "codigo": "PROD-001",
            "descricao": "Product Description",
            "cor": "Blue",
            "valorMedio": 123.45,
            "fornecedorId": "someFornecedor",
            "locacoes": [],
            "estoque": 0,
            "un": "un"
        }

        # Inject the mock data
        await page.evaluate(f'''
            currentProduct = {mock_product_data};
            configData.fornecedores = {{ "someFornecedor": {{ "nome": "Some Fornecedor" }} }};
            renderDetails();
        ''')

        # Wait for the average cost to be displayed
        await expect(page.locator('#produto-custo-medio')).to_have_text('R$ 123,45')

        # Take a screenshot
        await page.screenshot(path='jules-scratch/verification/verification.png')

        await browser.close()

asyncio.run(main())
