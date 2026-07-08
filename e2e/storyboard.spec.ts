import { expect, test } from '@playwright/test';
import { authenticate } from './fixtures';

test('turns a script into editable storyboard scenes without charging credits', async ({ page }) => {
  let project = {
    id: 'project-1',
    name: 'Launch film',
    description: null,
    updatedAt: new Date().toISOString(),
    _count: { assets: 0, predictions: 0, scenes: 0 },
    scenes: [] as any[],
  };

  await authenticate(page);
  await page.route('**/api/v1/projects', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [project] });
    return route.continue();
  });
  await page.route('**/api/v1/projects/project-1', (route) => route.fulfill({ json: project }));
  await page.route('**/api/v1/projects/project-1/storyboard-plan', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.scene_count).toBe(3);
    expect(body.total_duration_seconds).toBe(15);
    project = {
      ...project,
      _count: { ...project._count, scenes: 3 },
      scenes: [0, 1, 2].map((index) => ({
        id: `scene-${index}`,
        index,
        title: `Scene ${index + 1}`,
        prompt: `Cinematic planned shot ${index + 1}`,
        notes: 'Script excerpt',
        durationSeconds: 5,
        predictions: [],
      })),
    };
    return route.fulfill({ status: 201, json: { scenes: project.scenes, credits_charged: 0 } });
  });

  await page.goto('/projects');
  await page.getByPlaceholder('Paste a screenplay, narration, ad concept, or scene outline...').fill(
    'A runner waits beneath the city lights. The starting signal flashes and she launches forward. She crosses the finish line at sunrise.',
  );
  await page.getByLabel('Scenes').fill('3');
  await page.getByLabel('Total seconds').fill('15');
  await page.getByRole('button', { name: 'Create storyboard plan' }).click();

  await expect(page.getByText('Cinematic planned shot 1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Generate in Studio' })).toHaveCount(3);
  await page.getByRole('button', { name: 'Edit scene' }).first().click();
  await expect(page.getByRole('heading', { name: 'Edit Scene 1' })).toBeVisible();
});
