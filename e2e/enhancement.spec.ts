import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('offers all enhancement models and submits an exact-quoted image upscale', async ({ page }) => {
  let submitted: any;
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [
      { id: 'image-asset', storageObjectId: 'image-storage', url: 'https://media.test/input.png', thumbnailUrl: 'https://media.test/input.png', type: 'image', prediction: null },
      { id: 'video-asset', storageObjectId: 'video-storage', url: 'https://media.test/input.mp4', thumbnailUrl: 'https://media.test/input.webp', type: 'video', prediction: null },
    ],
    'POST /api/v1/generate/quote': { credits: 1, inspected: { input_megapixels: 2, output_megapixels: 8 } },
    'POST /api/v1/generate': async (route) => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'upscale-1', status: 'succeeded', output_url: 'https://media.test/upscaled.png' }) });
    },
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Image Upscale/ }).click();
  const imageModel = page.locator('label', { hasText: 'AI Engine Model' }).locator('..').locator('select');
  await expect(imageModel.locator('option')).toHaveText([
    'P-Image Upscale (Fast)', 'Google Upscaler (Clean 2× / 4×)', 'Clarity Pro Upscaler (Creative Detail)',
  ]);
  await page.getByRole('button', { name: /Uploaded image/ }).click();
  await imageModel.selectOption('google/upscaler');
  await expect(page.getByText('Exact charge: 1 credits')).toBeVisible();
  await page.getByRole('button', { name: /Generate Output/ }).click();
  await expect(page.getByText(/Generation Complete/)).toBeVisible();
  expect(submitted.workflow).toBe('image-upscale');
  expect(submitted.image_storage_object_id).toBe('image-storage');
  expect(submitted.params.upscale_factor).toBe('x2');

  await page.getByRole('button', { name: /Video Enhance/ }).click();
  const videoModel = page.locator('label', { hasText: 'AI Engine Model' }).locator('..').locator('select');
  await expect(videoModel.locator('option')).toHaveText([
    'Topaz Video Upscale (Professional)', 'Crystal Video Upscaler (Faces + Products)', 'Grok Video Extension (Extend Scene)',
  ]);
});
