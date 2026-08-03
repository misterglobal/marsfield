import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

const scene = {
  id: 'scene-1', index: 0, title: 'Morning hook', durationSeconds: 5,
  location: 'Bright kitchen', description: 'Maya starts her morning routine.',
  characterAction: 'Mixes the product into water.', expression: 'Energetic',
  wardrobe: 'Black fitness outfit', cameraFraming: 'Medium shot', cameraMovement: 'Slow push-in',
  lighting: 'Morning window light', productVisible: true, dialogue: 'Let’s get moving.',
  voiceover: '', onScreenText: '6:00 AM', transition: 'Quick cut',
};

const project = {
  id: 'influencer-project-1', title: 'Maya morning routine', idea: 'A morning fitness promotion.',
  status: 'scenes_draft', durationSeconds: 5, aspectRatio: '9:16', scenesRevision: 1,
  influencerId: 'influencer-1', productId: 'product-1', brief: {}, scenes: [scene, { ...scene, id: 'scene-2', index: 1, title: 'Product close-up' }],
  storyboards: [], videoGenerations: [],
};

test('duplicates an influencer project as a clean editable variation', async ({ page }) => {
  let duplicated = false;
  const copy = { ...project, id: 'influencer-project-copy', title: 'Maya morning routine variation', scenesRevision: 1 };
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/influencer/influencers': [{ id: 'influencer-1', name: 'Maya', status: 'approved', currentVersion: 1, profile: { age: 25 }, versions: [] }],
    'GET /api/v1/influencer/products': [{ id: 'product-1', name: 'Natural Energy' }],
    'GET /api/v1/influencer/projects': [{ ...project, _count: { scenes: 2 } }],
    'GET /api/v1/influencer/projects/influencer-project-1': project,
    'GET /api/v1/influencer/projects/influencer-project-copy': copy,
    'POST /api/v1/influencer/projects/influencer-project-1/duplicate': async (route) => {
      duplicated = true;
      await route.fulfill({ status: 201, json: copy });
    },
  });
  await page.goto('/influencer');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: /Maya morning routine/ }).click();
  await page.getByRole('button', { name: 'Create variation' }).click();
  await expect(page.getByRole('heading', { name: 'Maya morning routine variation' })).toBeVisible();
  expect(duplicated).toBe(true);
});

test('adds a manual scene to an editable influencer plan', async ({ page }) => {
  let payload: any;
  const expanded = { ...project, scenes: [...project.scenes, { ...scene, id: 'scene-3', index: 2, title: 'Scene 3', durationSeconds: 1 }] };
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/influencer/influencers': [], 'GET /api/v1/influencer/products': [],
    'GET /api/v1/influencer/projects': [{ ...project, _count: { scenes: 2 } }],
    'GET /api/v1/influencer/projects/influencer-project-1': project,
    'POST /api/v1/influencer/projects/influencer-project-1/scenes': async (route) => {
      payload = route.request().postDataJSON(); await route.fulfill({ status: 201, json: expanded });
    },
  });
  await page.goto('/influencer');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: /Maya morning routine/ }).click();
  await page.getByRole('button', { name: 'Add scene' }).click();
  await expect(page.getByText('3. Scene 3')).toBeVisible();
  expect(payload).toMatchObject({ duration_seconds: 1, camera_framing: 'Medium shot', product_visible: false });
});

test('scans a public product URL and saves reviewed product data', async ({ page }) => {
  let saved: any;
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/influencer/influencers': [], 'GET /api/v1/influencer/products': [], 'GET /api/v1/influencer/projects': [],
    'POST /api/v1/influencer/products/scan-url': {
      name: 'Natural Energy Mix', brand_name: 'Example Brand', category: 'Supplements',
      description: 'A citrus drink mix.', detected_claims: ['Supports everyday energy'], restrictions_to_review: ['Do not present as medical treatment'],
      brand_colours: ['orange', 'white'], image_urls: ['https://cdn.example.test/product.jpg'], source_url: 'https://example.test/products/energy', scanned_at: new Date().toISOString(),
    },
    'POST /api/v1/influencer/products': async (route) => { saved = route.request().postDataJSON(); await route.fulfill({ status: 201, json: { id: 'product-scanned', ...saved } }); },
  });
  await page.goto('/influencer');
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByPlaceholder('https://brand.example/products/product-name').fill('https://example.test/products/energy');
  await page.getByRole('button', { name: 'Scan product URL' }).click();
  await expect(page.getByLabel('Product name', { exact: true }).first()).toHaveValue('Natural Energy Mix');
  await page.getByRole('button', { name: 'Save reviewed product' }).click();
  expect(saved).toMatchObject({ name: 'Natural Energy Mix', brand_name: 'Example Brand', source_url: 'https://example.test/products/energy', approved_claims: ['Supports everyday energy'] });
});
