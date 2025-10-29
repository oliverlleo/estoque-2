
import json
from playwright.sync_api import sync_playwright, TimeoutError, Route

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # --- MOCK DATA ---
    product_id = "PRODUCT-WITH-CONVERSAO"
    conversao_id = "CONVERSAO-XYZ"

    # Mock product data with a 'conversaoId'
    mock_product = {
        "id": product_id,
        "codigo": "PROD-123",
        "descricao": "Produto de Teste Padrão",
        "isSobra": False,
        "conversaoId": conversao_id,
        "un": "un",
    }

    # Mock conversion data with the specific measurement
    mock_conversao = {
        "id": conversao_id,
        "fator_conversao_sobra": "2.5m x 1.2m"
    }

    # --- INTERCEPTION LOGIC ---
    def handle_route(route: Route):
        url = route.request.url
        # ONLY intercept requests to the Firestore backend. Do not intercept the initial HTML load.
        # A real firestore URL contains 'googleapis.com'. We check for the collection and document ID.

        # Intercept the fetch for the product document
        if f"/produtos/{product_id}" in url and "googleapis.com" in url:
            print(f"Intercepted and mocked product detail request for {product_id}")
            # The body needs to be a JSON string.
            body = json.dumps(mock_product)
            route.fulfill(status=200, content_type="application/json", body=body)
            return

        # Intercept the fetch for the conversion document
        if f"/conversoes/{conversao_id}" in url and "googleapis.com" in url:
            print(f"Intercepted and mocked conversao data request for {conversao_id}")
            body = json.dumps(mock_conversao)
            route.fulfill(status=200, content_type="application/json", body=body)
            return

        # For all other requests (like the initial page HTML), let them pass through
        route.continue_()

    page.route("**/*", handle_route)

    # --- SCRIPT EXECUTION ---
    product_url = f"http://localhost:8000/detalhe-produto.html?id={product_id}"

    try:
        print(f"Navigating to {product_url}...")
        page.goto(product_url, wait_until="domcontentloaded")
        page.wait_for_load_state('networkidle')


        print("Waiting for product measurement to be visible with mock data...")
        # Now the page should render correctly and this selector should be found.
        page.wait_for_selector("#produto-medida:has-text('2.5m x 1.2m')", timeout=10000)
        print("Product measurement found with correct mock data.")

        print("Taking screenshot...")
        page.screenshot(path="jules-scratch/verification/product_measurement.png")
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
