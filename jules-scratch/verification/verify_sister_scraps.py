
import json
from playwright.sync_api import sync_playwright, TimeoutError, Route

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # --- MOCK DATA ---
    # This is the main product being viewed, which is a scrap.
    main_scrap_product = {
        "id": "F02Kr32W5b6wP4Fm16bL",
        "codigo": "SCRAP-001",
        "descricao": "Sobra de Teste Principal (Clique para ver irmãs)",
        "isSobra": True,
        "originalProductId": "PARENT-PROD-XYZ",
        "un": "m²",
        "fornecedorId": "mock-fornecedor",
        "locacoes": [{"locacao": "A1-B2", "localId": "mock-local", "estoque": 5.5}]
    }

    # This is the "sister" scrap that should appear in the modal.
    sister_scrap_product = {
        "id": "SISTER-SCRAP-ID-1",
        "codigo": "SCRAP-002",
        "descricao": "Sobra Irmã 1",
        "isSobra": True,
        "originalProductId": "PARENT-PROD-XYZ",
        "un": "m²",
        "medida_sobra": "1.2x0.8",
        "locacoes": [{"locacao": "C3-D4", "localId": "mock-local", "estoque": 2.1}]
    }

    # --- INTERCEPTION LOGIC ---
    def handle_route(route: Route):
        # Intercept the fetch for the main product detail
        if "F02Kr32W5b6wP4Fm16bL" in route.request.url and route.request.method == "GET":
             # This is a simplified mock for getDoc. In a real app, the response
             # structure might be more complex (e.g., inside a 'document' field).
             # We assume the app logic directly uses the JSON response.
            print(f"Intercepted and mocked product detail request for {main_scrap_product['id']}")
            route.fulfill(status=200, json=main_scrap_product)
            return

        # Intercept the query for other scraps
        if "produtos" in route.request.url and "where" in route.request.url:
             # This is a simplified mock for a 'query' call.
            print("Intercepted and mocked query for sister scraps.")
            # The query looks for all sobras from the same parent.
            # We must return BOTH so the app logic can filter out the current one.
            route.fulfill(status=200, json=[main_scrap_product, sister_scrap_product])
            return

        # For all other requests, let them continue to the network
        route.continue_()

    # Apply the interception logic to all network requests
    # Note: Using '*' might be too broad in a real complex app, but it's fine for this case.
    page.route("**/*", handle_route)

    # --- SCRIPT EXECUTION ---
    scrap_product_url = "http://localhost:8000/detalhe-produto.html?id=F02Kr32W5b6wP4Fm16bL"

    try:
        print(f"Navigating to {scrap_product_url}...")
        # Use 'networkidle' to give a chance for initial fetches to be caught
        page.goto(scrap_product_url, wait_until="networkidle")

        print("Waiting for product description to be visible...")
        # Now it should be populated with our mock data
        page.wait_for_selector("#produto-descricao:has-text('Sobra de Teste Principal')", timeout=5000)
        print("Product description found with mock data.")

        print("Attempting to click product description...")
        page.locator("#produto-descricao").click()
        print("Clicked product description.")

        print("Waiting for sobras modal to be visible...")
        page.wait_for_selector("#sobras-modal", state="visible", timeout=5000)
        print("Sobras modal is visible.")

        print("Waiting for modal content to load with sister scrap...")
        # Check if the sister scrap's code is now rendered in the list
        page.wait_for_selector("#sobras-list-container li:has-text('SCRAP-002')", timeout=5000)
        print("Modal content loaded with sister scrap data.")

        print("Taking screenshot...")
        page.screenshot(path="jules-scratch/verification/sister_scraps_modal.png")
        print("Screenshot captured successfully!")

    except TimeoutError as e:
        print(f"\\nA timeout error occurred: {e}\\n")
        print("Page HTML on failure:")
        print(page.content())
    except Exception as e:
        print(f"\\nAn unexpected error occurred: {e}\\n")
        print("Page HTML on failure:")
        print(page.content())

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
