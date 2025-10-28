import json
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Mock data to be injected into localStorage
    mock_etiquetas = [
        {
            "productId": "prod1",
            "labelId": "label1",
            "locacaoId": "loc1",
            "fornecedor": "Fornecedor A",
            "enderecamento": "A1-B2-C3 (CD)",
            "data": {
                "descricao": "PRODUTO DE TESTE MUITO LONGO PARA VERIFICAR O AJUSTE DE FONTE AUTOMATICO",
                "cor": "AZUL",
                "codigo": "SKU-001"
            }
        },
        {
            "productId": "prod2",
            "labelId": "label2",
            "locacaoId": "loc2",
            "fornecedor": "Fornecedor B",
            "enderecamento": "D4-E5-F6 (LOJA)",
            "data": {
                "descricao": "PRODUTO DE TESTE 2",
                "cor": "VERMELHO",
                "codigo": "SKU-002"
            }
        },
        {
            "productId": "prod3",
            "labelId": "label3",
            "locacaoId": "loc3",
            "fornecedor": "Fornecedor C",
            "enderecamento": "G7-H8-I9 (DEP)",
            "data": {
                "descricao": "PRODUTO DE TESTE 3",
                "cor": "VERDE",
                "codigo": "SKU-003"
            }
        }
    ]

    # Navigate to a page on the domain to set localStorage
    page.goto("http://localhost:8000/produtos.html")

    # Inject data into localStorage
    page.evaluate(f"localStorage.setItem('etiquetasParaImprimir', '{json.dumps(mock_etiquetas)}')")

    # Navigate to the etiquetas page
    page.goto("http://localhost:8000/etiquetas.html")

    # Switch to 50x25 format
    page.get_by_role("button", name="Tamanho 50x25").click()

    # Wait for the new 50x25 labels to render and take a screenshot
    expect(page.locator(".etiqueta-50x25-container")).to_have_count(2)
    page.screenshot(path="jules-scratch/verification/verification-final-stacked-layout.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
