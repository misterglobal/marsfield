import { Page, Route } from '@playwright/test';

export const testUser = { id: 'user-owned', email: 'e2e@marsfield.test', name: 'E2E User' };

export async function authenticate(page: Page): Promise<void> {
  await page.addInitScript((user) => {
    localStorage.setItem('token', 'e2e-jwt');
    localStorage.setItem('user', JSON.stringify(user));
  }, testUser);
}

type Override = unknown | ((route: Route) => Promise<void>);

export async function mockApi(page: Page, overrides: Record<string, Override> = {}): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const key = `${request.method()} ${path}`;
    if (key in overrides) {
      const value = overrides[key];
      if (typeof value === 'function') {
        await value(route);
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
      }
      return;
    }

    if (path === '/api/v1/assets' || path === '/api/v1/projects' || path === '/api/v1/account/api-keys' || path === '/api/v1/account/plans') {
      await route.fulfill({ json: [] });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unmocked API request: ${key}` }) });
  });
}
