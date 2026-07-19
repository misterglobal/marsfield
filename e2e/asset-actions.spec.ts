import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('routes an owned library asset into the selected Studio workflow', async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [{
      id: 'owned-image-action', storageObjectId: 'owned-image-storage',
      url: 'https://media.test/action.png', thumbnailUrl: 'https://media.test/action.png',
      type: 'image', isFavorite: false, createdAt: '2026-07-06T12:00:00Z', prediction: null,
    }],
  });

  await page.goto('/library');
  const upscale = page.getByRole('link', { name: 'Upscale' });
  await expect(upscale).toHaveAttribute('href', /workflow=image-upscale.*asset_id=owned-image-action/);
  await upscale.click();

  await expect(page.getByRole('button', { name: /Image Upscale/ })).toHaveClass(/btn-primary/);
  await expect(page.getByRole('button', { name: /Uploaded image/ }).getByText('Selected')).toBeVisible();
  await expect(page.getByText('Choose an image to upscale')).toBeVisible();
});

test('shows media-appropriate actions only', async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [
      { id: 'video-action', storageObjectId: 'video-storage', url: 'https://media.test/video.mp4', thumbnailUrl: null, type: 'video', isFavorite: false, createdAt: '2026-07-06T12:00:00Z', prediction: null },
      { id: 'audio-action', storageObjectId: 'audio-storage', url: 'https://media.test/audio.mp3', thumbnailUrl: null, type: 'audio', isFavorite: false, createdAt: '2026-07-06T12:00:00Z', prediction: null },
    ],
  });
  await page.goto('/library');
  await expect(page.getByRole('link', { name: 'Kling edit' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Enhance' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Extend' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Use for lip sync' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Upscale' })).toHaveCount(0);
});

test('offers send-to actions after a generated video finishes', async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [],
    'POST /api/v1/generate': {
      id: 'prediction-video',
      status: 'processing',
      output_url: null,
      predictions: [{ id: 'prediction-video', status: 'processing', output_url: null, variation_index: 0 }],
      credits_charged: 1,
    },
    'GET /api/v1/predictions/prediction-video': {
      id: 'prediction-video',
      status: 'succeeded',
      output_url: 'https://media.test/generated.mp4',
      asset_id: 'generated-asset',
      asset_type: 'video',
    },
  });

  await page.goto('/');
  await page.locator('textarea').fill('A cinematic generated video.');
  await page.getByRole('button', { name: 'Generate Output' }).click();

  await expect(page.getByRole('link', { name: 'Add captions' })).toHaveAttribute('href', /workflow=video-caption.*asset_id=generated-asset/);
  await expect(page.getByRole('link', { name: 'Resize' })).toHaveAttribute('href', /workflow=social-resize.*asset_id=generated-asset/);
  await expect(page.getByRole('link', { name: 'Enhance' })).toHaveAttribute('href', /workflow=video-enhance.*asset_id=generated-asset/);
});
