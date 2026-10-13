import { test, expect } from '@playwright/test';

async function local(page: any) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Prøv på denne enhed' }).click();
}

async function navigate(page: any, desktop: string, mobile: string = desktop) {
  const desktopButton = page.getByRole('button', { name: desktop, exact: true });
  if (await desktopButton.isVisible()) await desktopButton.click();
  else await page.getByRole('button', { name: mobile, exact: true }).click();
}

test('quick text creation is interpreted, reviewed and creates reminders', async ({ page }) => {
  await local(page);
  await page.getByLabel('Hurtig opgave').fill('Vask bilen hjemme, 45 minutter, bil, hver uge');
  await expect(page.getByText('Lokation: Hjemme', { exact: true })).toBeVisible();
  await expect(page.getByText('45 minutter', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Gennemse', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Gennemse den fortolkede opgave' })).toBeVisible();
  await expect(dialog.getByLabel('Opgavens titel')).toHaveValue('Vask bilen');
  await expect(dialog.getByLabel('Eller vælg antal minutter')).toHaveValue('45');
  await expect(dialog.getByLabel('Hjemme', { exact: true })).toBeChecked();
  await expect(dialog.getByLabel('Gentag opgaven')).toHaveValue('interval');
  await dialog.getByRole('button', { name: 'Godkend og opret', exact: true }).click();
  await expect(page.getByText('Opgaven er gemt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '45 min.', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vask bilen', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Godt at have på radaren' })).toBeVisible();
  await expect(page.locator('.reminder-panel')).toContainText('En ny tilbagevendende forekomst er aktuel.');

  await navigate(page, 'Indstillinger', 'Mere');
  await expect(page.getByLabel('Vis relevante påmindelser i appen')).toBeChecked();
  await page.getByLabel('En deadline er højst tre dage væk').uncheck();
  await expect(page.getByText('Påmindelsesvalg er gemt.', { exact: true })).toBeVisible();
  await page.reload();
  await navigate(page, 'Indstillinger', 'Mere');
  await expect(page.getByLabel('En deadline er højst tre dage væk')).not.toBeChecked();
});

test('statistics and improved history reflect corrected work', async ({ page }, testInfo) => {
  await local(page);
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Fase 8 statistik');
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await page.locator('.task-card').filter({ hasText: 'Fase 8 statistik' }).getByRole('button', { name: 'Start nu' }).click();
  const row = page.locator('.work-row').filter({ hasText: 'Fase 8 statistik' });
  await row.getByRole('button', { name: 'Pause', exact: true }).click();
  await row.getByRole('button', { name: 'Ret tid', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Minutter').fill('35');
  await page.getByRole('button', { name: 'Gem tid', exact: true }).click();
  await row.getByRole('button', { name: 'Afslut', exact: true }).click();

  await navigate(page, 'Statistik');
  await expect(page.getByRole('heading', { name: 'Statistik og historik' })).toBeVisible();
  await expect(page.locator('.metric-grid article').filter({ hasText: 'Afsluttede' })).toContainText('1');
  await expect(page.locator('.metric-grid article').filter({ hasText: 'Registreret tid' })).toContainText('35 min.');
  await page.getByRole('tab', { name: 'Historik' }).click();
  const history = page.locator('.history-list article').filter({ hasText: 'Fase 8 statistik' });
  await expect(history).toContainText('Faktisk 35 min.');
  await history.getByRole('button', { name: 'Ret tid' }).click();
  await page.getByRole('dialog').getByLabel('Minutter').fill('28');
  await page.getByRole('button', { name: 'Gem tid' }).click();
  await expect(history).toContainText('Faktisk 28 min.');
  await page.screenshot({ path: `../outputs/hverdagsro/phase8-${testInfo.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
