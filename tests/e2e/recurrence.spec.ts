import { test, expect } from '@playwright/test';
async function nav(page: any, name: string) {
  await page
    .getByRole('button', { name: new RegExp('^' + name + '(?: \\d+)?$') })
    .filter({ visible: true })
    .first()
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-12T10:00:00Z') });
  await page.goto('/');
  await page.getByRole('button', { name: 'Prøv på denne enhed' }).click();
});
test('recurring completion advances once and old time remains editable after reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Vask bilen hver uge');
  await page
    .getByRole('combobox', { name: 'Gentag opgaven', exact: true })
    .selectOption('interval');
  await page.getByLabel('Gentagelse fra').fill('2026-09-21');
  await page
    .getByRole('combobox', { name: 'Beregn næste gang', exact: true })
    .selectOption('completion');
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await page.getByRole('button', { name: 'Tilføj til kø', exact: true }).click();
  await nav(page, 'Min kø');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Afslut', exact: true }).click();
  await expect(page.locator('.work-list .work-row')).toHaveCount(0);
  await expect(page.locator('.work-history h3')).toHaveText('Vask bilen hver uge');
  await page.locator('.work-history').getByRole('button', { name: 'Ret tid', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Minutter', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Gem tid', exact: true }).click();
  await expect(page.locator('.work-history .timer')).toHaveText('00:45:00');
  await page.reload();
  await nav(page, 'Min kø');
  await expect(page.locator('.work-history .timer')).toHaveText('00:45:00');
  await nav(page, 'Opgaver');
  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card').getByText(/Planlagt fra/)).toContainText('19. okt.');
  await page.getByRole('button', { name: 'Rediger Vask bilen hver uge', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Bilvask med nyt navn');
  await page.getByRole('button', { name: 'Gem ændringer', exact: true }).click();
  await nav(page, 'Min kø');
  await expect(page.locator('.work-history h3')).toHaveText('Vask bilen hver uge');
});
test('a late seasonal occurrence remains single and can explicitly be skipped', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Klip hækken');
  await page.getByRole('combobox', { name: 'Gentag opgaven', exact: true }).selectOption('season');
  await page.getByLabel('Gentagelse fra').fill('2026-06-01');
  await expect(page.getByText('Gælder hvert år: 1. juni – 30. juni')).toBeVisible();
  await expect(page.getByText(/2000/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Tilføj sæsonperiode', exact: true }).click();
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await expect(page.locator('.task-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.task-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Tilføj til kø', exact: true }).click();
  await nav(page, 'Min kø');
  await page.getByRole('button', { name: 'Spring denne gang over', exact: true }).click();
  await expect(
    page.locator('.work-history').getByText('Sprunget over', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Perioden 2026-09-01/)).toBeVisible();
  await expect(page.locator('.work-list .work-row')).toHaveCount(0);
  await expect(page.locator('.skip-link')).not.toBeFocused();
  await page.clock.runFor(5000);
  await page.screenshot({
    path: `../outputs/hverdagsro/recurrence-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await nav(page, 'Opgaver');
  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card').getByText(/Planlagt fra/)).toContainText('1. jun.');
});
