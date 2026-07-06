import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('shows transparent credit charges in account history', async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/account/usage': {
      plan: 'creator', credits_used: 18, credits_limit: 450, credits_remaining: 432,
      storage_usage_bytes: 1024, storage_limit_bytes: '53687091200', project_count: 2, asset_count: 5,
      recent_usage: [{
        id: 'usage-1', event_type: 'generation', credits: 9, created_at: '2026-07-05T12:00:00Z',
        prediction: { workflow: 'text-to-image', model: 'google/nano-banana-pro', prompt: 'Campaign image', variationCount: 3 },
      }],
    },
  });

  await page.goto('/settings');
  await expect(page.getByText('432 / 450')).toBeVisible();
  await expect(page.getByText('9 credits')).toBeVisible();
  await expect(page.getByText(/text-to-image.*google\/nano-banana-pro.*3 variations/)).toBeVisible();
});

test('updates Nano Banana Pro estimates for resolution and variations', async ({ page }) => {
  await authenticate(page);
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Image Generation/ }).click();
  await page.locator('label', { hasText: 'AI Engine Model' }).locator('..').locator('select').selectOption('google/nano-banana-pro');
  await page.locator('label', { hasText: 'Resolution' }).locator('..').locator('select').selectOption('4K');
  await page.locator('label', { hasText: 'Variations' }).locator('..').locator('select').selectOption('3');
  await expect(page.getByText('Credit estimate: 6 base + 2 variations = 18')).toBeVisible();
});
