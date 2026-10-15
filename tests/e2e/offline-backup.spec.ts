import { test, expect } from '@playwright/test';

async function settings(page: any) {
  const desktop = page.getByRole('button', { name: 'Indstillinger', exact: true });
  await page.locator('button:visible').filter({ hasText: /^(Indstillinger|Mere)$/ }).first().waitFor({ state: 'visible' });
  if (await desktop.isVisible()) await desktop.click();
  else await page.getByRole('button', { name: 'Mere', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('installs its offline shell and reopens saved tasks without network', async ({ page, context }) => {
  const manifest = await page.evaluate(async () => fetch('/manifest.webmanifest').then((response) => response.json()));
  expect(manifest.name).toBe('Få det Gjort');
  expect(manifest.display).toBe('standalone');
  const offlineReady = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    return {
      controlled: !!navigator.serviceWorker.controller,
      script: !!(await caches.match('/assets/app.js')),
      styles: !!(await caches.match('/assets/index.css')),
    };
  });
  expect(offlineReady).toEqual({ controlled: true, script: true, styles: true });
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Tilgængelig helt offline');
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await expect(page.getByText('Opgaven er gemt', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tilgængelig helt offline', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tilgængelig helt offline', exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('exports a reviewed backup and restores it after explicit confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Bevar mig i backup');
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await settings(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Eksportér familiebackup', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^faa-det-gjort-familiebackup-\d{4}-\d{2}-\d{2}\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const file = Buffer.concat(chunks);

  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Skal fjernes ved gendannelse');
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await settings(page);
  await page.getByRole('button', { name: 'Vælg familiebackup', exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: file });
  await expect(page.getByText('Kontrollér før import', { exact: true })).toBeVisible();
  await page.getByText('Gendan hele backupen', { exact: true }).click();
  const replace = page.getByRole('button', { name: 'Erstat lokale data', exact: true });
  await expect(replace).toBeDisabled();
  await page.getByLabel('Jeg har kontrolleret filen og vil erstatte alle lokale data.').check();
  await replace.click();
  await page.getByRole('button', { name: /^Opgaver/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole('button', { name: 'Bevar mig i backup', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skal fjernes ved gendannelse', exact: true })).toHaveCount(0);
});

test('shares a family backup through the system share sheet and exports a total backup', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        const file = data.files?.[0];
        (window as typeof window & { sharedBackup?: string }).sharedBackup = file?.name;
      },
    });
  });
  await page.reload();
  await settings(page);
  await page.getByRole('button', { name: 'Del familiebackup', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { sharedBackup?: string }).sharedBackup)).toMatch(/^faa-det-gjort-familiebackup-\d{4}-\d{2}-\d{2}\.json$/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Eksportér totalbackup', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^faa-det-gjort-totalbackup-\d{4}-\d{2}-\d{2}\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(backup.format).toBe('faa-det-gjort-totalbackup');
  expect(backup.device.profile.name).toBe('Dig');
  expect(backup.family.format).toBe('faa-det-gjort-backup');
});
