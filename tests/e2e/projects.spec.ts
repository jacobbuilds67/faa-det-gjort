import { test, expect } from '@playwright/test';

async function nav(page: any, name: string) {
  await page.getByRole('button', { name: new RegExp(`^${name}(?: \\d+)?$`) }).filter({ visible: true }).first().click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('project subtasks respect dependencies and update progress', async ({ page }, testInfo) => {
  await nav(page, 'Projekter');
  await page.getByRole('button', { name: 'Nyt projekt', exact: true }).click();
  await page.getByLabel('Projektnavn').fill('Male udhus');
  await page.getByLabel('Beskrivelse').fill('Fra vask til sidste lag maling');
  await page.getByRole('button', { name: 'Gem projekt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Male udhus', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Ny delopgave', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Vask træværk');
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await page.getByRole('button', { name: 'Ny delopgave', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Slib træværk');
  await page.getByRole('checkbox', { name: /Vask træværk/ }).check();
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await expect(page.getByText('0%', { exact: true })).toBeVisible();
  await expect(page.getByText('Venter på: Vask træværk', { exact: true })).toBeVisible();

  await nav(page, 'Opgaver');
  for (const name of ['Vask træværk', 'Slib træværk']) {
    await page.locator('.task-card').filter({ has: page.getByRole('button', { name, exact: true }) }).getByRole('button', { name: 'Tilføj til kø', exact: true }).click();
  }
  await nav(page, 'Min kø');
  const blocked = page.locator('.work-row').filter({ has: page.getByRole('heading', { name: 'Slib træværk', exact: true }) });
  await expect(blocked.getByText('Venter på: Vask træværk', { exact: true })).toBeVisible();
  await expect(blocked.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
  const first = page.locator('.work-row').filter({ has: page.getByRole('heading', { name: 'Vask træværk', exact: true }) });
  await first.getByRole('button', { name: 'Afslut', exact: true }).click();
  await expect(blocked.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();

  await nav(page, 'Projekter');
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
  await expect(page.getByText('1 af 2 afsluttet', { exact: true })).toBeVisible();
  await page.reload();
  await nav(page, 'Projekter');
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
  await page.screenshot({ path: `../outputs/hverdagsro/projects-${testInfo.project.name}.png`, fullPage: true });
});
