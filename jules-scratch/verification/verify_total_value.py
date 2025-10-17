import os
from playwright.sync_api import sync_playwright

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Get the absolute path to the HTML file
        file_path = os.path.abspath('movimentacoes.html')

        # Navigate to the local HTML file
        page.goto(f'file://{file_path}')

        # Switch to "Entrada" mode to make the import button visible
        page.click('label.toggle-switch')

        # Wait for the button to be visible and then click it
        page.wait_for_selector('#btn-importar-xml', state='visible')
        page.click('#btn-importar-xml')

        # Wait for the modal to be visible
        page.wait_for_selector('#xml-import-modal', state='visible')

        # Create a dummy XML file for upload
        xml_content = """
        <NFe>
            <infNFe>
                <ide><nNF>123</nNF></ide>
                <total>
                    <ICMSTot>
                        <vProd>150.00</vProd>
                        <vFrete>20.00</vFrete>
                    </ICMSTot>
                </total>
                <det nItem="1">
                    <prod>
                        <cProd>001</cProd>
                        <xProd>Product A</xProd>
                        <uCom>UN</uCom>
                        <qCom>2</qCom>
                        <vUnCom>50.00</vUnCom>
                        <vProd>100.00</vProd>
                    </prod>
                    <imposto>
                        <vIPI>10.00</vIPI>
                    </imposto>
                </det>
                <det nItem="2">
                    <prod>
                        <cProd>002</cProd>
                        <xProd>Product B</xProd>
                        <uCom>KG</uCom>
                        <qCom>1</qCom>
                        <vUnCom>50.00</vUnCom>
                        <vProd>50.00</vProd>
                    </prod>
                    <imposto>
                        <vIPI>5.00</vIPI>
                    </imposto>
                </det>
            </infNFe>
        </NFe>
        """
        xml_file_path = 'jules-scratch/verification/sample.xml'
        with open(xml_file_path, 'w') as f:
            f.write(xml_content)

        # Upload the XML file
        page.locator('#xml-file-input').set_input_files(xml_file_path)

        # Wait for the table to be populated
        page.wait_for_selector('#xml-products-table tbody tr')

        # Take a screenshot
        page.screenshot(path='jules-scratch/verification/verification.png')

        browser.close()

if __name__ == '__main__':
    run_verification()