import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('creates a YouTube dry-run plan and converts it to a storyboard project', async ({ page }) => {
  const production = {
    id: 'yt-prod-1',
    topic: 'The Sogdians and the Silk Road',
    audience: 'curious history viewers',
    targetDurationMin: 8,
    status: 'planned',
    estimatedCreditsMin: 200,
    projectId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    research: { angles: [{ angle: 'Origins and context', questions: ['What made this topic matter?'] }] },
    strategy: { positioning: 'A cinematic history explainer.', targetAudience: 'curious history viewers', contentType: 'long-form documentary', keywords: ['sogdians', 'silk road'] },
    script: {
      hook: 'There is a version of the Silk Road most people never hear.',
      sections: [{ name: 'Cold open', narration: 'There is a hidden story.' }],
    },
    storyboard: [
      { index: 0, title: 'Scene 1', sceneDescription: 'Ancient traders cross the desert.', durationSeconds: 24, cameraDirection: 'Slow push-in' },
    ],
    seo: { titles: ['The Hidden Story of the Sogdians'], tags: ['history'] },
    thumbnailConcepts: [{ title: 'The hidden story', prompt: 'Cinematic thumbnail.' }],
  };
  let createPayload: any;

  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/youtube/productions': [],
    'POST /api/v1/youtube/productions': async (route) => {
      createPayload = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { ...production, credits_charged: 0 } });
    },
    'GET /api/v1/youtube/productions/yt-prod-1': production,
    'POST /api/v1/youtube/productions/yt-prod-1/create-project': async (route) => {
      await route.fulfill({ status: 201, json: { project_id: 'project-youtube', project: { id: 'project-youtube', name: 'YouTube: The Sogdians and the Silk Road' } } });
    },
  });

  await page.goto('/youtube');
  await page.getByPlaceholder('Topic, e.g. The Sogdians and the Silk Road').fill('The Sogdians and the Silk Road');
  await page.getByLabel('Target minutes').fill('8');
  await page.getByLabel('Research angles').fill('8');
  await page.getByRole('button', { name: 'Create dry-run plan' }).click();

  await expect(page.getByText('A cinematic history explainer.')).toBeVisible();
  await expect(page.getByText('The Hidden Story of the Sogdians')).toBeVisible();
  await expect(page.getByText('Ancient traders cross the desert.')).toBeVisible();
  expect(createPayload).toMatchObject({ topic: 'The Sogdians and the Silk Road', target_duration_min: 8, angle_count: 8 });

  await page.getByRole('button', { name: 'Create storyboard project' }).click();
  await expect(page.getByRole('link', { name: 'Open Projects' })).toBeVisible();
});
