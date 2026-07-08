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
