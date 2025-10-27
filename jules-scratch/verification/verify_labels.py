
import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Start a local server to serve the files
        # This is a workaround for the fact that Playwright doesn't handle file:// paths with modules correctly
        import os
        os.system('python -m http.server 8001 &')
        await asyncio.sleep(2) # Give the server time to start

        await page.goto("http://localhost:8001/etiquetas.html")

        # Mock the data that would be in localStorage
        await page.evaluate("""
            localStorage.setItem('etiquetasParaImprimir', JSON.stringify([
                {
                    "labelId": "test-product-1-0",
                    "productId": "test-product-1",
                    "data": {
                        "codigo": "TEST-001",
                        "descricao": "PRODUTO DE TESTE 1",
                        "cor": "AZUL",
                        "fornecedorId": "fornecedor-1",
                        "grupoId": "grupo-1",
                        "aplicacaoIds": [],
                        "conjuntoIds": [],
                        "conversaoId": "",
                        "locacoes": [
                            {
                                "locacao": "1-A-01-A",
                                "localId": "local-1",
                                "estoque": 10
                            }
                        ],
                        "arquivado": false
                    },
                    "enderecamento": "1-A-01-A (ESTOQUE GERAL)",
                    "fornecedor": "FORNECEDOR 1"
                }
            ]));
        """)

        await page.reload()

        # Verify the 50x100 format
        await page.locator("#btn-formato-100x50").click()
        await expect(page.locator(".etiqueta-container")).not_to_have_class("formato-50x25")
        await page.screenshot(path="jules-scratch/verification/verification-100x50.png")

        # Verify the 50x25 format
        await page.locator("#btn-formato-50x25").click()
        await expect(page.locator("#etiquetas-container")).to_have_class("formato-50x25")
        await page.screenshot(path="jules-scratch/verification/verification-50x25.png")

        await browser.close()
        os.system('kill %1')


if __name__ == "__main__":
    asyncio.run(main())
