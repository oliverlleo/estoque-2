from playwright.sync_api import sync_playwright, expect
import time

def verify_new_location_transfer():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Navigate to the page
        page.goto("http://localhost:8000/movimentacoes.html")

        # 2. Open Transfer Modal
        # Wait for the button to be visible and click it
        page.wait_for_selector("#btn-transferencia")
        page.click("#btn-transferencia")

        # 3. Select a product
        # Wait for options to populate
        page.wait_for_timeout(2000) # Simple wait for async population

        # Get the select element
        select = page.locator("#transf-produto")
        # Select the second option (first real product)
        # We need to know a value, or just select by index.
        # Let's get the value of the second option.
        options = select.locator("option").all()
        if len(options) < 2:
            print("Not enough products to test")
            return

        value = options[1].get_attribute("value")
        select.select_option(value)

        # 4. Click "Nova Locação"
        page.click("#btn-new-location")

        # 5. Verify Modal Opens
        page.wait_for_selector("#add-location-modal", state="visible")

        # 6. Fill form
        # Select first local
        local_select = page.locator("#new-location-local")
        local_options = local_select.locator("option").all()
        if len(local_options) > 1:
            local_select.select_option(local_options[1].get_attribute("value"))

        # Fill locacao with valid format (must be unique, so use random or timestamp)
        # Format: 1-A-01-B
        import random
        # Generating a somewhat unique value to avoid duplication errors on multiple runs
        suffix = random.randint(10, 99)
        new_locacao = f"1-A-{suffix}-B"
        page.fill("#new-location-input", new_locacao)

        # Take screenshot of the form filled
        page.screenshot(path="verification/verification_form_filled.png")

        # 7. Submit
        page.click("#form-add-location button[type='submit']")

        # 8. Handle Alert (accept it)
        # Playwright auto-dismisses alerts but we want to know if it appeared.
        # Actually in this specific implementation, it's a standard browser alert.
        # Playwright handles dialogs automatically by dismissing them by default, but we can accept.
        page.on("dialog", lambda dialog: dialog.accept())

        # Wait for modal to close
        page.wait_for_selector("#add-location-modal", state="hidden")

        # 9. Verify destination dropdown
        # The code refreshes destination selects.
        # We need to check if the new location appears in the destination select.
        # Add a destination row if none exists (though code does it automatically if list empty)

        # Check the first destination select
        dest_select = page.locator(".transf-dest-select").first

        # The option text should contain our new locacao
        # We need to wait a bit for the async refresh
        page.wait_for_timeout(1000)

        text_content = dest_select.text_content()
        if new_locacao in text_content:
            print("SUCCESS: New location found in destination dropdown")
        else:
            print("FAILURE: New location NOT found in destination dropdown")
            print("Dropdown content:", text_content)

        # Take final screenshot
        page.screenshot(path="verification/verification_final.png")

        browser.close()

if __name__ == "__main__":
    verify_new_location_transfer()
