import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Prøv på denne enhed' }).click();
});
test('create, reopen, edit, archive and restore a task', async ({ page }) => {
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Opgavens titel').fill('Kontrollér røgalarmer');
  await dialog.getByRole('button', { name: '15 min.', exact: true }).click();
  await dialog.getByLabel('Sommerhus', { exact: true }).check();
  await dialog.getByRole('combobox', { name: 'Prioritet', exact: true }).selectOption('high');
  await dialog.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Kontrollér røgalarmer', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Kontrollér røgalarmer', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Rediger Kontrollér røgalarmer', exact: true }).click();
  await dialog.getByLabel('Opgavens titel').fill('Kontrollér alle røgalarmer');
  await dialog.getByRole('button', { name: 'Gem ændringer', exact: true }).click();
  await page
    .getByRole('button', { name: 'Rediger Kontrollér alle røgalarmer', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Arkivér', exact: true }).click();
  await page.getByRole('button', { name: 'Se alle', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Kontrollér alle røgalarmer', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Arkiv', exact: true }).click();
  await page
    .getByRole('button', { name: 'Gendan Kontrollér alle røgalarmer', exact: true })
    .click();
  await page.getByRole('button', { name: 'Arkiv', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Kontrollér alle røgalarmer', exact: true }),
  ).toBeVisible();
});
test('filters by time and remembers the selected location', async ({ page }) => {
  await page.getByRole('button', { name: 'Eller prøv med eksempelopgaver' }).click();
  await page.getByRole('button', { name: '15 min.', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Giv krukkerne lidt kærlighed', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vask bilen', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Valgt lokation' }).selectOption({ label: 'Sommerhus' });
  await page.getByRole('button', { name: '1 time', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Gør terrassen klar til efteråret', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Valgt lokation' })).toHaveValue(/.+/);
  await expect(
    page.getByRole('combobox', { name: 'Valgt lokation' }).locator('option:checked'),
  ).toHaveText('Sommerhus');
});
test('saves a task during a network interruption', async ({ page, context }) => {
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Oprettet uden internet');
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Oprettet uden internet', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Oprettet uden internet', exact: true }),
  ).toBeVisible();
});
test('has no horizontal overflow', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Gør lidt. Få ro.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('creates and renames locations and categories', async ({ page }) => {
  const desktopSettings = page.getByRole('button', { name: 'Indstillinger', exact: true });
  const mobileSettings = page.getByRole('button', { name: 'Mere', exact: true });
  await expect(desktopSettings.or(mobileSettings)).toBeVisible();
  if (await desktopSettings.isVisible()) await desktopSettings.click();
  else await mobileSettings.click();
  await page.getByRole('textbox', { name: 'Ny lokation', exact: true }).fill('Værksted');
  await page.getByRole('textbox', { name: 'Ny lokation', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Rediger Værksted', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nyt navn', exact: true }).fill('Garagen');
  await page.getByRole('textbox', { name: 'Nyt navn', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Rediger Garagen', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Ny kategori', exact: true }).fill('Værktøj');
  await page.getByRole('textbox', { name: 'Ny kategori', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Garagen', exact: true })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Kategori', exact: true })
    .selectOption({ label: 'Værktøj' });
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('ranks by priority and explains the suggestion', async ({ page }) => {
  for (const [title, priority] of [
    ['Vigtig opgave', 'high'],
    ['Mindre vigtig opgave', 'low'],
  ]) {
    await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Opgavens titel').fill(title);
    await dialog.getByRole('combobox', { name: 'Prioritet', exact: true }).selectOption(priority);
    await dialog.getByRole('button', { name: 'Opret opgave', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  const cards = page.locator('.task-card');
  await expect(
    cards.first().getByRole('button', { name: 'Vigtig opgave', exact: true }),
  ).toBeVisible();
  await expect(cards.first()).toContainText('Høj prioritet · Passer præcis til din tid');
  await page.getByText('Sådan vælges dine forslag', { exact: true }).click();
  await expect(
    page.getByText('Din valgte prioritet bliver ikke ændret.', { exact: false }),
  ).toBeVisible();
});
