import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('uploads a reference and submits only its returned storage ID', async ({ page }) => {
  let uploaded = false;
  let submittedBody: any;

  await authenticate(page);
  await page.route('https://r2.test/**', async (route) => {
    uploaded = true;
    expect(route.request().method()).toBe('PUT');
    expect(route.request().headers()['content-type']).toBe('image/png');
    await route.fulfill({ status: 200, body: '' });
  });
  await mockApi(page, {
    'POST /api/v1/uploads/presign': {
      id: 'storage-owned-image',
      upload_url: 'https://r2.test/users/user-owned/image.png',
      headers: { 'Content-Type': 'image/png' },
    },
    'POST /api/v1/uploads/complete': {
      id: 'storage-owned-image', asset_id: 'asset-owned-image', url: 'https://media.test/image.png',
      mime_type: 'image/png', byte_size: 68, kind: 'image',
    },
    'POST /api/v1/generate': async (route) => {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'prediction-1', status: 'succeeded', output_url: 'https://media.test/output.mp4' }),
      });
    },
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Image-to-Video/ }).click();
  await page.locator('textarea').fill('Animate the reference image with a slow camera push.');
  await page.locator('#image-upload').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4V0AAAAASUVORK5CYII=', 'base64'),
  });

  await expect(page.getByText(/Image selected: reference\.png/)).toBeVisible();
  await page.getByRole('button', { name: /Generate Output/ }).click();
  await expect(page.getByText(/Generation Complete/)).toBeVisible();
  expect(uploaded).toBe(true);
  expect(submittedBody.image_storage_object_id).toBe('storage-owned-image');
  expect(JSON.stringify(submittedBody)).not.toContain('foreign-storage-object');
});

test('reuses an owned library asset without uploading it again', async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [{
      id: 'asset-owned', storageObjectId: 'storage-owned', url: 'https://media.test/owned.png',
      thumbnailUrl: 'https://media.test/owned-thumb.webp', type: 'image', prediction: null,
    }],
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Image-to-Video/ }).click();
  await page.locator('textarea').fill('Animate the selected library image.');
  const asset = page.getByRole('button', { name: /Uploaded image/ });
  await expect(asset).toBeVisible();
  await asset.click();
  await expect(asset.getByText('Selected')).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate Output/ })).toBeEnabled();
});

test('builds a general Kling edit from a preset and owned source video', async ({ page }) => {
  let submittedBody: any;
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [{
      id: 'asset-video', storageObjectId: 'storage-video', url: 'https://media.test/source.mp4',
      thumbnailUrl: 'https://media.test/source.webp', type: 'video', prediction: null,
    }],
    'POST /api/v1/generate': async (route) => {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'edit-1', status: 'succeeded', output_url: 'https://media.test/edited.mp4' }),
      });
    },
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Kling Video Edit/ }).click();
  await page.locator('select:has(option[value="replace-background"])').selectOption('replace-background');
  await expect(page.locator('textarea')).toHaveValue(/Replace the background/);
  await page.getByRole('button', { name: /Uploaded video/ }).click();
  await page.getByRole('button', { name: /Generate Output/ }).click();
  await expect(page.getByText(/Generation Complete/)).toBeVisible();

  expect(submittedBody.workflow).toBe('video-edit');
  expect(submittedBody.params.reference_video_id).toBe('storage-video');
  expect(submittedBody.params.video_reference_type).toBeUndefined();
});
