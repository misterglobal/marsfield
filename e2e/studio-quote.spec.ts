import { expect, test, type Route } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('generation waits for the current quote and ignores a superseded response', async ({ page }) => {
  const pendingQuotes: Route[] = [];
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [{ id: 'image-asset', storageObjectId: 'image-storage', url: 'https://media.test/input.png', thumbnailUrl: null, type: 'image', prediction: null }],
    'POST /api/v1/generate/quote': async (route) => { pendingQuotes.push(route); },
  });
  await page.goto('/?workflow=image-upscale&asset_id=image-asset');
  await expect.poll(() => pendingQuotes.length).toBe(1);
  const model = page.locator('label', { hasText: 'AI Engine Model' }).locator('..').locator('select');
  await model.selectOption('google/upscaler');
  await expect.poll(() => pendingQuotes.length).toBe(2);
  const generate = page.getByRole('button', { name: /Generate Output/ });
  await expect(generate).toBeDisabled();
  await pendingQuotes[1].fulfill({ json: { credits: 2 } });
  await expect(page.getByText('Exact charge: 2 credits')).toBeVisible();
  await expect(generate).toBeEnabled();
  const oldResponse = page.waitForResponse((response) => response.url().endsWith('/generate/quote') && response.request().postDataJSON().model === 'prunaai/p-image-upscale');
  await pendingQuotes[0].fulfill({ json: { credits: 99 } });
  await (await oldResponse).finished();
  await expect(page.getByText('Exact charge: 2 credits')).toBeVisible();
  await model.selectOption('philz1337x/clarity-pro-upscaler');
  await expect(generate).toBeDisabled();
});

test('signing out clears the previous session workspace', async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/projects': [{ id: 'private-project', name: 'Private project' }],
    'GET /api/v1/assets': [{ id: 'private-image', storageObjectId: 'private-storage', url: 'https://media.test/input.png', thumbnailUrl: null, type: 'image', prediction: { prompt: 'Private generation' } }],
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('private-project');
  await page.getByRole('textbox', { name: 'Creative prompt' }).fill('Private draft');
  await expect(page.getByRole('button', { name: 'Preview Private generation' })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole('textbox', { name: 'Creative prompt' })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Preview Private generation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Generate Output/ })).toBeDisabled();
});
