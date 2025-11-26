
import { test, expect } from '@playwright/test';

test('test sorting for "Regra de Conversão" and "Aplicações" columns', async ({ page }) => {
  await page.goto('http://localhost:8000/produtos.html');

  // Wait for the table to be populated
  await page.waitForSelector('#table-produtos tbody tr');

  // Click on the "Regra de Conversão" header to sort
  await page.click('th[data-column="conversaoId"]');
  await page.waitForTimeout(1000); // Wait for the sort to apply
  await page.screenshot({ path: 'test-results/verification_conversao.png' });

  // Click on the "Aplicações" header to sort
  await page.click('th[data-column="aplicacaoIds"]');
  await page.waitForTimeout(1000); // Wait for the sort to apply
  await page.screenshot({ path: 'test-results/verification_aplicacoes.png' });
});
