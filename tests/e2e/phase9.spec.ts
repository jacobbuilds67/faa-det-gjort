import { expect, test, type Page } from '@playwright/test';

async function openLocalApp(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Prøv på denne enhed' }).click();
  await expect(page.getByRole('heading', { name: 'Gør lidt. Få ro.' })).toBeVisible();
}

async function openPage(page: Page, name: string, mobileName = name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const primary = page
    .getByRole('button', { name: new RegExp(`^${escaped}(?:\\s|$)`) })
    .filter({ visible: true })
    .first();
  if (await primary.count()) await primary.click();
  else
    await page
      .getByRole('button', { name: mobileName, exact: true })
      .filter({ visible: true })
      .click();
}

test.beforeEach(async ({ page }) => {
  await openLocalApp(page);
});

test('har navngivne kontroller, springlink og synligt tastaturfokus', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'da');
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Spring til indhold' });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveCSS('outline-style', 'solid');
  await skipLink.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  for (const [name, mobileName] of [
    ['I dag', 'I dag'],
    ['Opgaver', 'Opgaver'],
    ['Min kø', 'Min kø'],
    ['Projekter', 'Projekter'],
    ['Statistik', 'Statistik'],
    ['Indstillinger', 'Mere'],
  ]) {
    await openPage(page, name, mobileName);
    const audit = await page.evaluate(() => {
      const visible = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          box.width > 0 &&
          box.height > 0
        );
      };
      const nameOf = (element: HTMLElement) => {
        const labelledBy = element.getAttribute('aria-labelledby');
        const referenced = labelledBy
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ');
        const labels =
          'labels' in element
            ? Array.from((element as HTMLInputElement).labels ?? [])
                .map((label) => label.textContent)
                .join(' ')
            : '';
        return [
          element.getAttribute('aria-label'),
          referenced,
          labels,
          element.textContent,
          element.getAttribute('alt'),
          element.getAttribute('title'),
        ]
          .filter(Boolean)
          .join(' ')
          .trim();
      };
      const unnamed = Array.from(
        document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary'),
      )
        .filter(visible)
        .filter((element) => !nameOf(element))
        .map((element) => element.outerHTML.slice(0, 160));
      const ids = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map(
        (element) => element.id,
      );
      return {
        unnamed,
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        h1: document.querySelectorAll('main h1').length,
      };
    });
    expect(audit.unnamed).toEqual([]);
    expect(audit.duplicateIds).toEqual([]);
    expect(audit.h1).toBe(1);
  }
});

test('holder layouten inden for skærmen på alle hovedsider', async ({ page }) => {
  for (const [name, mobileName] of [
    ['I dag', 'I dag'],
    ['Opgaver', 'Opgaver'],
    ['Min kø', 'Min kø'],
    ['Projekter', 'Projekter'],
    ['Statistik', 'Statistik'],
    ['Indstillinger', 'Mere'],
  ]) {
    await openPage(page, name, mobileName);
    const dimensions = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.page, `${name} har vandret overløb`).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test('overholder build-budget og sender sikkerhedsmetadata', async ({ page, request }) => {
  const htmlResponse = await request.get('/');
  const html = await htmlResponse.text();
  const script = html.match(/src="([^"]+\.js)"/)?.[1];
  const style = html.match(/href="([^"]+\.css)"/)?.[1];
  expect(script).toBeTruthy();
  expect(style).toBeTruthy();
  const [scriptBody, styleBody] = await Promise.all([
    request.get(script!).then((response) => response.body()),
    request.get(style!).then((response) => response.body()),
  ]);
  expect(scriptBody.byteLength, 'JavaScript overstiger 550 kB').toBeLessThan(550_000);
  expect(styleBody.byteLength, 'CSS overstiger 60 kB').toBeLessThan(60_000);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /object-src 'none'/,
  );
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
    'content',
    'strict-origin-when-cross-origin',
  );
});

test('viser brugerinput som tekst uden at udføre HTML', async ({ page }) => {
  await page.getByRole('button', { name: 'Ny opgave', exact: true }).click();
  const payload = '<img src=x onerror="window.__phase9Xss=true">';
  await page.getByLabel('Opgavens titel').fill(payload);
  await page.getByRole('button', { name: 'Opret opgave', exact: true }).click();
  await expect(page.getByRole('button', { name: payload, exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as Window & { __phase9Xss?: boolean }).__phase9Xss),
  ).toBeUndefined();
  await expect(page.locator('.task-card img')).toHaveCount(0);
});

test('respekterer reduceret bevægelse', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page
    .getByRole('button', { name: 'Ny opgave', exact: true })
    .evaluate((button) => getComputedStyle(button).transitionDuration);
  expect(duration.split(',').every((value) => value.trim() === '0s')).toBe(true);
});
