import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('batch resizes an owned video into all social formats without credits', async ({ page }) => {
  const video = {
    id: 'video-1',
    storageObjectId: 'storage-video-1',
    url: 'https://example.com/source.mp4',
    thumbnailUrl: null,
    type: 'video',
    isFavorite: false,
    createdAt: new Date().toISOString(),
    prediction: { prompt: 'Source clip', model: 'openai/sora-2', workflow: 'text-to-video' },
  };
  let submitted: any;

  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [video],
    'POST /api/v1/generate/quote': async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({
        workflow: 'social-resize',
        model: 'local/ffmpeg-social-resize',
        video_storage_object_id: 'storage-video-1',
      });
      await route.fulfill({ json: { credits: 0, base_credits: 0, inspected: { duration: 24 } } });
    },
    'POST /api/v1/generate': async (route) => {
      submitted = route.request().postDataJSON();
      await route.fulfill({
        json: {
          id: 'resize-vertical',
          status: 'succeeded',
          output_url: 'https://example.com/vertical.mp4',
          credits_charged: 0,
          variation_group_id: 'resize-group-1',
          predictions: [
            { id: 'resize-vertical', status: 'succeeded', output_url: 'https://example.com/vertical.mp4', variation_index: 0 },
            { id: 'resize-square', status: 'succeeded', output_url: 'https://example.com/square.mp4', variation_index: 1 },
            { id: 'resize-landscape', status: 'succeeded', output_url: 'https://example.com/landscape.mp4', variation_index: 2 },
          ],
        },
      });
    },
  });

  await page.goto('/?workflow=social-resize&asset_id=video-1');
  await expect(page.getByRole('button', { name: /Social Resize/ })).toHaveClass(/btn-primary/);
  await page.getByLabel('Resize format').selectOption('square');
  await page.getByLabel('Resize mode').selectOption('fit');
  await page.getByLabel('Export all social formats').check();
  await expect(page.getByText('Exact charge: 0 credits')).toBeVisible();
  await page.getByRole('button', { name: 'Generate Output' }).click();

  await expect.poll(() => submitted).toBeTruthy();
  expect(submitted).toMatchObject({
    workflow: 'social-resize',
    model: 'local/ffmpeg-social-resize',
    video_storage_object_id: 'storage-video-1',
    params: { formats: ['vertical', 'square', 'landscape'], mode: 'fit', variations: 1 },
  });
});
