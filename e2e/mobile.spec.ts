import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test.describe('mobile layout', () => {
  for (const path of ['/', '/influencer', '/projects', '/library', '/kits', '/settings']) {
    test(`${path} fits the viewport and exposes mobile navigation`, async ({ page }) => {
      await authenticate(page);
      await mockApi(page, {
        'GET /api/v1/account/usage': {
          plan: 'free', credits_used: 0, credits_limit: 15, credits_remaining: 15,
          storage_usage_bytes: 0, storage_limit_bytes: '1073741824', project_count: 0, asset_count: 0,
          recent_usage: [],
        },
      });
      await page.goto(path);
      await expect(page.locator('.sidebar')).toBeHidden();
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
