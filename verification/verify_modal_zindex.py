from playwright.sync_api import sync_playwright

def verify_modal_issues():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console messages
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        page.goto("http://localhost:8000/movimentacoes.html")

        # Wait for data load
        page.wait_for_selector("#btn-transferencia")
        page.click("#btn-transferencia")

        # Transfer modal is now open. Check its z-index.
        transfer_z = page.eval_on_selector("#transferencia-modal", "el => getComputedStyle(el).zIndex")
        print(f"Transfer Modal Z-Index: {transfer_z}")

        # Select product to enable the new location button
        page.wait_for_timeout(1000)
        select = page.locator("#transf-produto")
        options = select.locator("option").all()
        if len(options) > 1:
            select.select_option(options[1].get_attribute("value"))

        # Click new location button
        page.click("#btn-new-location")

        # Add location modal should be open. Check its z-index and display.
        add_loc_display = page.eval_on_selector("#add-location-modal", "el => getComputedStyle(el).display")
        add_loc_z = page.eval_on_selector("#add-location-modal", "el => getComputedStyle(el).zIndex")

        print(f"Add Location Modal Display: {add_loc_display}")
        print(f"Add Location Modal Z-Index: {add_loc_z}")

        # Check if Add Location modal is covered by Transfer modal
        # We can checks bounding box or just infer from z-index.

        page.screenshot(path="verification/verification_modal_debug.png")

        browser.close()

if __name__ == "__main__":
    verify_modal_issues()
