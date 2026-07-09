import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

const captionModel = 'fictions-ai/autocaption:18a45ff0d95feb4449d192bbdc06b4a6df168fa33def76dfc51b78ae224b599b';

test('adds styled social captions to an owned video for an exact four-credit charge', async ({ page }) => {
  const video = {
    id: 'video-1', storageObjectId: 'storage-video-1', url: 'https://example.com/source.mp4', thumbnailUrl: null,
    type: 'video', isFavorite: false, createdAt: new Date().toISOString(), prediction: { prompt: 'Source clip', model: 'openai/sora-2', workflow: 'text-to-video' },
  };
  let submitted: any;
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [video],
    'POST /api/v1/generate/quote': async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ workflow: 'video-caption', model: captionModel, video_storage_object_id: 'storage-video-1' });
      await route.fulfill({ json: { credits: 4, base_credits: 4, inspected: { duration: 24 } } });
    },
    'POST /api/v1/generate': async (route) => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ json: { id: 'caption-prediction', status: 'succeeded', output_url: 'https://example.com/captioned.mp4' } });
    },
  });

  await page.goto('/?workflow=video-caption&asset_id=video-1');
  await expect(page.getByRole('button', { name: /Social Captions/ })).toHaveClass(/btn-primary/);
  await expect(page.getByText('Exact charge: 4 credits')).toBeVisible();
  await page.getByLabel('Caption preset').selectOption('landscape');
  await expect(page.getByLabel('Caption font size')).toHaveValue('7');
  await expect(page.getByLabel('Characters per caption')).toHaveValue('20');
  await page.getByLabel('Highlight color').fill('#ff00ff');
  await page.getByRole('button', { name: 'Generate Output' }).click();

  await expect.poll(() => submitted).toBeTruthy();
  expect(submitted).toMatchObject({
    workflow: 'video-caption', model: captionModel, video_storage_object_id: 'storage-video-1',
    params: { fontsize: 7, MaxChars: 20, highlight_color: '#ff00ff' },
  });
});
