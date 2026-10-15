import { test, expect } from '@playwright/test';
async function openQueue(page: any) {
  await page
    .getByRole('button', { name: 'Min kø', exact: true })
    .filter({ visible: true })
    .first()
    .click();
}
test('queue survives reload, moves, times work, corrects it and leaves next task idle', async ({
  page,
}) => {
  await page.goto('/');
  for (const name of ['Første opgave', 'Anden opgave', 'Tredje opgave']) {
    await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
    await page.getByLabel('Opgavens titel').fill(name);
    await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
    await page
      .locator('.task-card')
      .filter({ has: page.getByRole('button', { name, exact: true }) })
      .getByRole('button', { name: 'Tilføj til kø', exact: true })
      .click();
  }
  await openQueue(page);
  await expect(page.locator('.work-list h3')).toHaveText([
    'Første opgave',
    'Anden opgave',
    'Tredje opgave',
  ]);
  await page.getByLabel('Køens tidsramme').selectOption('15');
  await expect(page.getByText('75 min. over tidsrammen')).toBeVisible();
  await page.getByRole('button', { name: 'Flyt Første opgave ned' }).click();
  await expect(page.locator('.work-list h3')).toHaveText([
    'Anden opgave',
    'Første opgave',
    'Tredje opgave',
  ]);
  await page.reload();
  await openQueue(page);
  await expect(page.locator('.work-list h3')).toHaveText([
    'Anden opgave',
    'Første opgave',
    'Tredje opgave',
  ]);
  await expect(page.getByLabel('Køens tidsramme')).toHaveValue('15');
  const row = page
    .locator('.work-row')
    .filter({ has: page.getByRole('heading', { name: 'Anden opgave', exact: true }) });
  await row.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(row.getByText('Timeren kører', { exact: true })).toBeVisible();
  await page.reload();
  await openQueue(page);
  await expect(row.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Pause', exact: true }).click();
  await row.getByRole('button', { name: 'Ret tid', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Minutter').fill('12');
  await page.getByRole('button', { name: 'Gem tid', exact: true }).click();
  await expect(row.getByLabel('Registreret tid for Anden opgave')).toHaveText('00:12:00');
  await row.getByRole('button', { name: 'Fortsæt', exact: true }).click();
  await row.getByRole('button', { name: 'Afslut', exact: true }).click();
  await expect(page.locator('.work-list h3')).toHaveText(['Første opgave', 'Tredje opgave']);
  await expect(page.getByText('Timeren kører', { exact: true })).toHaveCount(0);
  await expect(page.locator('.work-history h3')).toHaveText(['Anden opgave']);
  await expect(
    page.locator('.work-list').getByRole('button', { name: 'Start', exact: true }),
  ).toHaveCount(2);
  await page
    .locator('.work-list .work-row')
    .first()
    .getByRole('button', { name: 'Spring over', exact: true })
    .click();
  await expect(page.locator('.work-list h3')).toHaveText(['Tredje opgave']);
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});
test('pointer drag supports mouse and touch handles', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const name of ['Træk mig', 'Hertil']) {
    await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
    await page.getByLabel('Opgavens titel').fill(name);
    await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
    await page
      .locator('.task-card')
      .filter({ has: page.getByRole('button', { name, exact: true }) })
      .getByRole('button', { name: 'Tilføj til kø', exact: true })
      .click();
  }
  await openQueue(page);
  const from = await page.getByRole('button', { name: 'Træk Træk mig', exact: true }).boundingBox();
  const to = await page.getByRole('heading', { name: 'Hertil', exact: true }).boundingBox();
  if (!from || !to) throw new Error('Missing drag bounds');
  if (testInfo.project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: from.x + 10, y: from.y + 10 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: to.x + 10, y: to.y + 10 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(from.x + 10, from.y + 10);
    await page.mouse.down();
    await page.mouse.move(to.x + 10, to.y + 10, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.locator('.work-list h3')).toHaveText(['Hertil', 'Træk mig']);
});

test('direct work remains available after pausing outside the queue, including offline edits', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  await page.getByLabel('Opgavens titel').fill('Ryd op i værkstedet');
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await page.getByRole('button', { name: 'Start nu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Min kø', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fortsæt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ret tid', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Minutter').fill('8');
  await page.getByRole('button', { name: 'Gem tid', exact: true }).click();
  await expect(page.getByLabel('Registreret tid for Ryd op i værkstedet')).toHaveText('00:08:00');
  await context.setOffline(false);
  await page.reload();
  await openQueue(page);
  await expect(page.getByLabel('Registreret tid for Ryd op i værkstedet')).toHaveText('00:08:00');
  await page.screenshot({
    path: `../outputs/hverdagsro/queue-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Fortsæt', exact: true }).click();
  await page.getByRole('button', { name: 'Afslut', exact: true }).click();
  await expect(page.locator('.work-history h3')).toHaveText('Ryd op i værkstedet');
});
