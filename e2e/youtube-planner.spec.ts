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
  let narrationPayload: any;

  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/youtube/productions': [],
    'POST /api/v1/youtube/productions': async (route) => {
      createPayload = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { ...production, credits_charged: 0 } });
    },
    'GET /api/v1/youtube/productions/yt-prod-1': production,
    'GET /api/v1/projects': [{ id: 'other-project', name: 'Unrelated project', _count: { scenes: 0, assets: 0, predictions: 0 } }],
    'GET /api/v1/projects/project-youtube': { id: 'project-youtube', name: 'YouTube: The Sogdians and the Silk Road', scenes: [], _count: { scenes: 0, assets: 0, predictions: 0 } },
    'POST /api/v1/youtube/productions/yt-prod-1/create-project': async (route) => {
      await route.fulfill({ status: 201, json: { project_id: 'project-youtube', project: { id: 'project-youtube', name: 'YouTube: The Sogdians and the Silk Road' } } });
    },
    'POST /api/v1/youtube/productions/yt-prod-1/narration-package': async (route) => {
      narrationPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        json: {
          ...production,
          narration: { status: 'prepared', totalWords: 1200, estimatedDurationSeconds: 480, ttsText: 'There is a hidden story.' },
          captions: { status: 'draft', count: 1, srt: '1\n00:00:00,000 --> 00:00:02,000\nThere is a hidden story.' },
          audio: { status: 'not_generated', sceneTiming: [{ index: 0, title: 'Scene 1', startSeconds: 0, endSeconds: 24 }] },
          credits_charged: 0,
        },
      });
    },
  });

  await page.goto('/youtube');
  await page.getByLabel('Story or working title').fill('The Sogdians and the Silk Road');
  await page.getByLabel('Runtime').fill('8');
  await page.getByLabel('Research lanes').fill('8');
  await page.getByRole('button', { name: 'Build production plan' }).click();

  await expect(page.getByText('A cinematic history explainer.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Check the direction of your video' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to script' }).first().click();
  await expect(page.getByRole('heading', { name: 'Review the story and pacing' })).toBeFocused();
  await expect(page.getByText('There is a hidden story.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to storyboard' }).first().click();
  await expect(page.getByRole('button', { name: /03 Storyboard/ })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByText('Ancient traders cross the desert.')).toBeVisible();
  expect(createPayload).toMatchObject({ topic: 'The Sogdians and the Silk Road', target_duration_min: 8, angle_count: 8 });

  await page.getByRole('button', { name: 'Back to script' }).click();
  await expect(page.getByRole('heading', { name: 'Review the story and pacing' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to storyboard' }).first().click();
  await page.getByRole('button', { name: 'Continue to delivery' }).first().click();
  await expect(page.getByText('The Hidden Story of the Sogdians')).toBeVisible();
  await page.getByLabel('Read speed (WPM)').fill('150');
  await page.getByRole('button', { name: 'Prepare timing package' }).click();
  await expect(page.getByText('1200', { exact: true })).toBeVisible();
  await expect(page.locator('.youtube-panel-stack .youtube-metrics strong').nth(2)).toHaveText('1');
  await expect(page.locator('textarea[readonly]')).toHaveValue('There is a hidden story.');
  expect(narrationPayload).toMatchObject({ words_per_minute: 150 });

  await page.getByRole('button', { name: 'Send to edit project' }).click();
  await expect(page.getByRole('link', { name: 'Open edit project' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue in edit project' })).toHaveAttribute('href', '/projects?project_id=project-youtube');
  await page.getByRole('link', { name: 'Continue in edit project' }).click();
  await expect(page.getByRole('heading', { name: 'YouTube: The Sogdians and the Silk Road', exact: true })).toBeVisible();
});

test('saved plans resume delivery and a failed handoff can be retried without timing', async ({ page }) => {
  const production = {
    id: 'saved-plan', topic: 'Saved story', targetDurationMin: 8, status: 'narration_prepared',
    projectId: null, storyboard: [{ index: 0, durationSeconds: 10 }],
    script: { sections: [{ narration: 'A draft story.' }] },
    narration: { totalWords: 3, estimatedDurationSeconds: 2 },
  };
  let attempts = 0;
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/youtube/productions': [production],
    'GET /api/v1/youtube/productions/saved-plan': production,
    'POST /api/v1/youtube/productions/saved-plan/create-project': async (route) => {
      attempts++;
      await route.fulfill(attempts === 1
        ? { status: 500, json: { error: 'Could not create project. Try again.' } }
        : { status: 201, json: { project_id: 'saved-project' } });
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/youtube');
  await expect(page.getByRole('heading', { name: 'Turn your idea into a video plan.' })).toBeVisible();
  await page.getByRole('button', { name: /Saved story/ }).click();
  await expect(page.getByRole('heading', { name: 'Prepare your handoff' })).toBeVisible();
  await page.getByLabel('Read speed (WPM)').fill('20');
  await expect(page.getByRole('button', { name: 'Rebuild timing package' })).toBeDisabled();
  await expect(page.getByRole('alert').filter({ hasText: 'between 90 and 210' })).toBeVisible();
  await page.getByRole('button', { name: 'Send to edit project' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not create project' })).toBeVisible();
  await page.getByRole('button', { name: 'Send to edit project' }).click();
  await expect(page.getByRole('link', { name: 'Continue in edit project' })).toHaveAttribute('href', '/projects?project_id=saved-project');
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
