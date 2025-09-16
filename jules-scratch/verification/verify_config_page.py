import os
from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Get the absolute path to the HTML file
        file_path = os.path.abspath('configuracoes.html')

        # Navigate to the local HTML file
        page.goto(f'file://{file_path}')

        # Wait for the grid to be visible
        config_grid = page.locator('#config-grid')
        expect(config_grid).to_be_visible()

        # Take a screenshot of the new card layout
        page.screenshot(path='jules-scratch/verification/config_page_layout.png')

        # Find and click the "Fornecedores" card
        fornecedores_card = page.locator('.config-card[data-config-id="fornecedor"]')
        expect(fornecedores_card).to_be_visible()
        fornecedores_card.click()

        # Wait for the modal to appear
        modal = page.locator('#config-modal')
        expect(modal).to_be_visible()

        # Check the modal title
        modal_title = page.locator('#modal-title')
        expect(modal_title).to_have_text('Cadastro de Fornecedores')

        # Take a screenshot with the modal open
        page.screenshot(path='jules-scratch/verification/config_page_modal.png')

        browser.close()

if __name__ == '__main__':
    run_verification()
