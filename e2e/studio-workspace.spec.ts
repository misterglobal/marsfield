import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('project and Creative Director changes flow into generation', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/projects': [{ id: 'project-studio', name: 'Neon Dragon' }],
    'POST /api/v1/generate': async (route) => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ json: { id: 'studio-result', status: 'succeeded', output_url: 'https://media.test/result.mp4' } });
    },
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Creative canvas', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('project-studio');
  await page.getByRole('textbox', { name: 'Creative prompt' }).fill('A dragon glides above the city');
  await page.getByRole('button', { name: 'Refine my direction' }).click();
  await expect(page.getByRole('textbox', { name: 'Creative prompt' })).toHaveValue(/cinematic lighting/);
  await page.getByRole('button', { name: /Generate Output/ }).click();
  await expect(page.getByText(/Generation Complete/)).toBeVisible();
  expect(submitted?.project_id).toBe('project-studio');
  expect(submitted?.prompt).toContain('A dragon glides above the city');
  await expect(page.locator('.studio-output video')).toHaveAttribute('src', 'https://media.test/result.mp4');
});

test('recent generations open in the canvas without submitting a generation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await authenticate(page);
  await mockApi(page, {
    'GET /api/v1/assets': [{
      id: 'recent-image', type: 'image', storageObjectId: 'owned-image',
      url: 'https://media.test/landscape.svg', thumbnailUrl: null,
      prediction: { prompt: 'An alpine lake at dusk' },
    }],
  });
  await page.route('https://media.test/landscape.svg', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#29263b"/><path d="M0 370L250 110L440 340L640 160L960 390V540H0Z" fill="#626080"/><path d="M0 390H960V540H0Z" fill="#343b55"/></svg>',
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Preview An alpine lake at dusk' }).click();
  await expect(page.getByRole('img', { name: 'An alpine lake at dusk' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate Output/ })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Universal prompt composer' })).toBeInViewport();
  if (process.env.STUDIO_SCREENSHOT_DIR) {
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await page.screenshot({ path: `${process.env.STUDIO_SCREENSHOT_DIR}/marsfield-studio-desktop.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('button', { name: /Generate Output/ })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Clear preview' }).click();
  await expect(page.getByRole('heading', { name: 'Your next idea starts here.' })).toBeVisible();
});

test('small screens expose the inspector and keep the composer within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('complementary', { name: 'Generation Settings' })).toBeHidden();
  await page.getByRole('button', { name: 'Generation Settings', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Generation Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Generation Settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Creative prompt' }).fill('A quiet moonlit garden');
  await expect(page.getByRole('button', { name: /Generate Output/ })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  if (process.env.STUDIO_SCREENSHOT_DIR) {
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await page.locator('.workspace-content').evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: `${process.env.STUDIO_SCREENSHOT_DIR}/marsfield-studio-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: /Generate Output/ }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.STUDIO_SCREENSHOT_DIR}/marsfield-studio-mobile-composer.png`, fullPage: true });
  }
});
