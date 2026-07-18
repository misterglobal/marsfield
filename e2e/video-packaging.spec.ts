import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('packages a video with hooks, title overlay, and thumbnail still assets', async ({ page }) => {
  const video = {
    id: 'video-package',
    storageObjectId: 'video-package-storage',
    url: 'https://media.test/source.mp4',
    thumbnailUrl: null,
    type: 'video',
    isFavorite: false,
    createdAt: '2026-07-17T12:00:00Z',
    prediction: { prompt: 'A founder reveals a product demo in a neon studio.', model: 'openai/sora-2', workflow: 'text-to-video' },
  };
  let overlayPayload: any;
  let thumbnailRequested = false;

  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [video],
    'POST /api/v1/assets/video-package/packaging/ideas': {
      hooks: ['Stop scrolling for this reveal.', 'The ending changes the whole demo.'],
      titleOverlays: ['Product reveal', 'Watch this shift'],
      thumbnailPrompts: ['Pick the clearest product frame.'],
    },
    'POST /api/v1/assets/video-package/packaging/thumbnails': async (route) => {
      thumbnailRequested = true;
      await route.fulfill({ status: 201, json: { assets: [{ id: 'thumb-1', url: 'https://media.test/thumb.jpg', time_seconds: 1.5 }] } });
    },
    'POST /api/v1/assets/video-package/packaging/title-overlay': async (route) => {
      overlayPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        json: { id: 'overlay-prediction', status: 'succeeded', output_url: 'https://media.test/overlay.mp4', asset_id: 'overlay-asset', credits_charged: 0 },
      });
    },
  });

  await page.goto('/library');
  await page.getByRole('button', { name: 'Ideas' }).click();
  await expect(page.getByText('Stop scrolling for this reveal.')).toBeVisible();
  await page.getByRole('button', { name: 'Product reveal' }).click();
  await page.getByLabel('Subtitle overlay for video-package').fill('Stop scrolling for this reveal.');
  await page.getByRole('button', { name: 'Save stills' }).click();
  await expect.poll(() => thumbnailRequested).toBe(true);
  await page.getByRole('button', { name: 'Render title overlay' }).click();

  await expect(page.getByText('Title-overlay video saved to your library.')).toBeVisible();
  expect(overlayPayload).toMatchObject({
    title: 'Product reveal',
    subtitle: 'Stop scrolling for this reveal.',
  });
});
