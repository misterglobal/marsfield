import { expect, test } from '@playwright/test';
import { authenticate } from './fixtures';

test('exports a reordered trimmed project timeline from owned video assets', async ({ page }) => {
  const project = {
    id: 'project-1',
    name: 'Launch film',
    description: null,
    updatedAt: new Date().toISOString(),
    _count: { assets: 2, predictions: 0, scenes: 0 },
    scenes: [],
  };
  const assets = [
    {
      id: 'asset-a', storageObjectId: 'storage-a', url: 'https://media.test/a.mp4',
      thumbnailUrl: null, type: 'video', prediction: { prompt: 'Opening shot', workflow: 'text-to-video', model: 'openai/sora-2' },
    },
    {
      id: 'asset-b', storageObjectId: 'storage-b', url: 'https://media.test/b.mp4',
      thumbnailUrl: null, type: 'video', prediction: { prompt: 'Closing shot', workflow: 'text-to-video', model: 'openai/sora-2' },
    },
  ];
  let exportPayload: any;

  await authenticate(page);
  await page.route('**/api/v1/projects', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [project] });
    return route.continue();
  });
  await page.route('**/api/v1/projects/project-1', (route) => route.fulfill({ json: project }));
  await page.route('**/api/v1/assets?project_id=project-1', (route) => route.fulfill({ json: assets }));
  await page.route('**/api/v1/projects/project-1/timeline-export', async (route) => {
    exportPayload = route.request().postDataJSON();
    return route.fulfill({
      status: 202,
      json: {
        id: 'timeline-prediction',
        status: 'processing',
        output_url: null,
        credits_charged: 0,
      },
    });
  });
  await page.route('**/api/v1/predictions/timeline-prediction', (route) => route.fulfill({
    json: { id: 'timeline-prediction', status: 'succeeded', output_url: 'https://media.test/final.mp4', asset_id: 'timeline-asset', asset_type: 'video' },
  }));

  await page.goto('/projects');
  await page.getByRole('button', { name: /Opening shot/ }).click();
  await page.getByRole('button', { name: /Closing shot/ }).click();
  await page.getByRole('button', { name: 'Up' }).last().click();
  await page.getByLabel('Clip 1 start').fill('1.5');
  await page.getByLabel('Clip 1 end').fill('4');
  await page.getByRole('button', { name: 'Export final video' }).click();

  await expect(page.getByText(/Timeline export ready/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add captions' })).toHaveAttribute('href', /workflow=video-caption.*asset_id=timeline-asset/);
  expect(exportPayload).toMatchObject({
    title: 'Final timeline export',
    clips: [
      { asset_id: 'asset-b', start_seconds: 1.5, end_seconds: 4 },
      { asset_id: 'asset-a', start_seconds: 0 },
    ],
  });
});

test('adds generated storyboard results to the timeline in scene order', async ({ page }) => {
  const project = {
    id: 'project-1',
    name: 'Storyboard film',
    description: null,
    updatedAt: new Date().toISOString(),
    _count: { assets: 2, predictions: 2, scenes: 2 },
    scenes: [
      {
        id: 'scene-2',
        index: 1,
        title: 'Second beat',
        prompt: 'The reveal.',
        notes: null,
        durationSeconds: null,
        predictions: [
          {
            id: 'prediction-2',
            status: 'succeeded',
            outputUrl: 'https://media.test/second.mp4',
            model: 'openai/sora-2',
            workflow: 'text-to-video',
            prompt: 'The reveal.',
            createdAt: new Date().toISOString(),
            assets: [{ id: 'asset-second', storageObjectId: 'storage-second', url: 'https://media.test/second.mp4', thumbnailUrl: null, type: 'video' }],
          },
        ],
      },
      {
        id: 'scene-1',
        index: 0,
        title: 'First beat',
        prompt: 'The opener.',
        notes: null,
        durationSeconds: null,
        predictions: [
          {
            id: 'prediction-1',
            status: 'succeeded',
            outputUrl: 'https://media.test/first.mp4',
            model: 'openai/sora-2',
            workflow: 'text-to-video',
            prompt: 'The opener.',
            createdAt: new Date().toISOString(),
            assets: [{ id: 'asset-first', storageObjectId: 'storage-first', url: 'https://media.test/first.mp4', thumbnailUrl: null, type: 'video' }],
          },
        ],
      },
    ],
  };
  let exportPayload: any;

  await authenticate(page);
  await page.route('**/api/v1/projects', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [project] });
    return route.continue();
  });
  await page.route('**/api/v1/projects/project-1', (route) => route.fulfill({ json: project }));
  await page.route('**/api/v1/assets?project_id=project-1', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/projects/project-1/timeline-export', async (route) => {
    exportPayload = route.request().postDataJSON();
    return route.fulfill({
      status: 202,
      json: {
        id: 'timeline-prediction',
        status: 'processing',
        output_url: null,
        credits_charged: 0,
      },
    });
  });
  await page.route('**/api/v1/predictions/timeline-prediction', (route) => route.fulfill({
    json: { id: 'timeline-prediction', status: 'succeeded', output_url: 'https://media.test/final-storyboard.mp4', asset_id: 'timeline-asset', asset_type: 'video' },
  }));

  await page.goto('/projects');
  await page.getByRole('button', { name: 'Add storyboard results' }).click();
  await expect(page.getByText('First beat result')).toBeVisible();
  await expect(page.getByText('Second beat result')).toBeVisible();
  await page.getByRole('button', { name: 'Export final video' }).click();

  await expect(page.getByText(/Timeline export ready/)).toBeVisible();
  expect(exportPayload).toMatchObject({
    title: 'Storyboard film final cut',
    clips: [
      { asset_id: 'asset-first', start_seconds: 0 },
      { asset_id: 'asset-second', start_seconds: 0 },
    ],
  });
});
