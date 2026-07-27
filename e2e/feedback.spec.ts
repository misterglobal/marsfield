import { expect, test } from '@playwright/test';
import { authenticate, mockApi } from './fixtures';

test('signed-in users can submit app feedback with page context', async ({ page }) => {
  let payload: any;

  await authenticate(page);
  await mockApi(page, {
    'POST /api/v1/feedback': async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        json: {
          id: 'feedback-1',
          type: payload.type,
          emailStatus: 'sent',
          createdAt: new Date().toISOString(),
        },
      });
    },
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Feedback' }).click();
  await page.getByLabel('Issue type').selectOption('upload_issue');
  await page.getByLabel('What happened?').fill('The uploaded video stayed visible after I removed the file from storage.');
  await page.getByRole('button', { name: 'Send feedback' }).click();

  await expect(page.getByText('Thanks — your feedback was sent.')).toBeVisible();
  expect(payload).toMatchObject({
    type: 'upload_issue',
    message: 'The uploaded video stayed visible after I removed the file from storage.',
  });
  expect(payload.page_url).toContain('/');
  expect(payload.user_agent).toBeTruthy();
  expect(payload.context).toMatchObject({ pathname: '/' });
});
