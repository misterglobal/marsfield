import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('warns before idle sign-out and lets the user continue', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-06T12:00:00Z') });
  await authenticate(page);
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByText('E2E User').first()).toBeVisible();

  await page.clock.runFor(28 * 60 * 1000);
  const warning = page.getByRole('alertdialog', { name: 'Your session is about to expire' });
  await expect(warning).toBeVisible();

  await warning.getByRole('button', { name: 'Continue session' }).click();
  await expect(warning).toBeHidden();
  await expect(page.getByText('E2E User').first()).toBeVisible();

  await page.clock.runFor(28 * 60 * 1000);
  await expect(warning).toBeVisible();
  await page.clock.runFor(2 * 60 * 1000);

  await expect(page.getByRole('heading', { name: 'Sign In to Marsfield' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Your session expired. Please sign in again.');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeNull();
});

test('turns an authenticated 401 into a friendly expired-session sign-in', async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/projects': async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid or expired authorization token' }),
      });
    },
  });

  await page.goto('/projects');

  await expect(page.getByRole('heading', { name: 'Sign In to Marsfield' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Your session expired. Please sign in again.');
  await expect(page.getByText('Invalid or expired authorization token')).toHaveCount(0);
});

test('synchronizes an expired session across tabs', async ({ context }) => {
  const firstPage = await context.newPage();
  const secondPage = await context.newPage();
  for (const page of [firstPage, secondPage]) {
    await authenticate(page);
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByText('E2E User').first()).toBeVisible();
  }

  await firstPage.evaluate(() => window.dispatchEvent(new Event('marsfield:session-expired')));

  for (const page of [firstPage, secondPage]) {
    await expect(page.getByRole('heading', { name: 'Sign In to Marsfield' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Your session expired. Please sign in again.');
  }
});

test('manual logout does not show the expired-session message', async ({ page }) => {
  await authenticate(page);
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Logout' }).click();

  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeNull();
});
