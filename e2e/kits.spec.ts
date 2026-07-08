import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('creates a reusable character from an owned asset and assigns it to a project', async ({ page }) => {
  let kits: any[] = [];
  const asset = { id: 'asset-face', storageObjectId: 'storage-face', url: 'https://example.com/face.png', thumbnailUrl: 'https://example.com/face.png', type: 'image' };
  const project = { id: 'project-film', name: 'Launch film', _count: { assets: 0, predictions: 0, scenes: 0 } };
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [asset],
    'GET /api/v1/projects': [project],
    'GET /api/v1/kits': async (route) => { await route.fulfill({ json: kits }); },
    'POST /api/v1/kits': async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ name: 'Maya', kind: 'character', asset_ids: ['asset-face'], project_ids: ['project-film'] });
      const kit = {
        id: 'kit-maya', name: body.name, kind: body.kind, description: body.description, promptRules: body.prompt_rules, voice: body.voice,
        colors: [], fonts: [], kitAssets: [{ asset }], projectAssignments: [{ project }],
      };
      kits = [kit];
      await route.fulfill({ status: 201, json: kit });
    },
  });

  await page.goto('/kits?asset_id=asset-face');
  await page.getByPlaceholder('Character name').fill('Maya');
  await page.getByPlaceholder(/Appearance, wardrobe/).fill('Short silver hair, red flight jacket, amber eyes. Preserve facial identity.');
  await page.getByRole('button', { name: 'Launch film' }).click();
  await page.getByRole('button', { name: 'Create kit' }).click();

  await expect(page.getByRole('heading', { name: 'Maya' })).toBeVisible();
  await expect(page.getByText('Used in Launch film')).toBeVisible();
});

test('offers Save to kit from a durable library asset', async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [{ id: 'asset-face', storageObjectId: 'storage-face', url: 'https://example.com/face.png', thumbnailUrl: null, type: 'image', isFavorite: false, createdAt: new Date().toISOString(), prediction: null }],
  });
  await page.goto('/library');
  await expect(page.getByRole('link', { name: 'Save to kit' })).toHaveAttribute('href', '/kits?asset_id=asset-face');
});
