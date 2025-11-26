const { test, expect } = require('@playwright/test');

test.describe('NFe Fractional Value Correction', () => {
  test('should display correction modal and allow import after fixing value', async ({ page }) => {
    // Aumentar o timeout para este teste específico
    test.setTimeout(120000);

    // Adicionar um listener para os logs do console da página
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    await page.goto('http://localhost:8000/movimentacoes.html');

    // Adicionar um timeout para aguardar o carregamento dos dados do Firestore
    await page.waitForTimeout(15000);

    // Esperar o carregamento da página
    await page.waitForSelector('#movement-wrapper', { state: 'visible', timeout: 60000 });

    // Clicar no botão para abrir o modal de importação XML
    await page.click('#btn-importar-xml');
    await page.waitForSelector('#xml-import-modal', { state: 'visible' });

    // Fazer o upload do arquivo XML de teste que causa o erro de valor fracionado
    const filePath = 'tests/fixtures/nfe_fracionada.xml';
    await page.setInputFiles('input#xml-file-input', filePath);

    // Aguardar o processamento do XML e o preenchimento da tabela
    await page.waitForSelector('#xml-products-table tbody tr', { state: 'visible' });

    // Clicar no botão de confirmar importação
    await page.click('#btn-confirmar-xml-import');

    // Esperar o modal de correção aparecer
    await page.waitForSelector('#correcao-fracionada-modal', { state: 'visible', timeout: 30000 });

    // Verificar se o item problemático está no modal
    const modalRow = page.locator('#correcao-fracionada-table-body tr');
    await expect(modalRow).toHaveCount(1);
    await expect(modalRow.locator('td').nth(0)).toHaveText('PROD-FRAC');

    // Corrigir o valor no input
    const quantityInput = modalRow.locator('.quantidade-corrigida');
    await quantityInput.fill('10'); // Um valor que resultará em um número inteiro

    // Submeter a correção
    await page.click('#btn-confirmar-correcao-fracionada');

    // Capturar a mensagem do alert que confirma a importação
    let alertMessage = '';
    page.on('dialog', async dialog => {
        alertMessage = dialog.message();
        await dialog.accept();
    });

    // Aguardar o processamento da importação (indicado pelo loader sumindo)
    await page.waitForSelector('#xml-import-loader', { state: 'hidden', timeout: 60000 });

    // Verificar se a mensagem de sucesso foi exibida
    expect(alertMessage).toContain('1 produto(s) importado(s) com sucesso!');

    // Tirar um screenshot final da tela de movimentações
    await page.screenshot({ path: 'tests/screenshots/movimentacoes_after_fractional_correction.png' });
  });
});