import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('compiles cinematic controls into the provider prompt', async ({ page }) => {
  let submitted: any;
  await authenticate(page);
  await mockApi(page, {
    'POST /api/v1/generate': async (route) => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'cinema-1', status: 'succeeded', output_url: 'https://media.test/cinema.mp4' }) });
    },
  });

  await page.goto('/');
  await page.locator('textarea').fill('A detective enters an empty train station.');
  await page.getByLabel('Enable cinematic controls').check();
  await page.getByLabel('Camera body').selectOption('70mm film camera');
  await page.getByLabel('Focal length').selectOption('85');
  await page.getByLabel('Camera movement').selectOption('Slow push-in');
  await page.getByLabel('Lighting').selectOption('Dramatic low-key light');
  await page.getByRole('button', { name: /Generate Output/ }).click();
  await expect(page.getByText(/Generation Complete/)).toBeVisible();

  expect(submitted.prompt).toContain('A detective enters an empty train station.');
  expect(submitted.prompt).toContain('70mm film camera');
  expect(submitted.prompt).toContain('85mm');
  expect(submitted.prompt).toContain('Slow push-in');
  expect(submitted.prompt).toContain('Dramatic low-key light');
});
