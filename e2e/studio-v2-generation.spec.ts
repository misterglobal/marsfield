import { expect, test } from "@playwright/test";
import { authenticate, mockApi } from "./fixtures";

test("generates an image through the provider-neutral Studio V2 layer", async ({ page }) => {
  let submittedPayload: Record<string, unknown> | undefined;
  let submissions = 0;
  let statusChecks = 0;

  await authenticate(page);
  await mockApi(page, {
    "POST /api/v1/generate": async (route) => {
      submissions += 1;
      submittedPayload = route.request().postDataJSON();
      await route.fulfill({
        json: {
          id: "prediction-v2-image",
          status: "succeeded",
          credits_charged: 1,
        },
      });
    },
    "GET /api/v1/predictions/prediction-v2-image": async (route) => {
      statusChecks += 1;
      await route.fulfill({
        json: {
          id: "prediction-v2-image",
          status: "succeeded",
          output_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='purple'/%3E%3C/svg%3E",
          asset_id: "asset-v2-image",
          asset_type: "image",
        },
      });
    },
  });

  await page.goto("/studio-v2");
  await page.getByLabel("What do you want to create?").fill("A violet observatory above the clouds");
  await page.getByRole("form", { name: "Universal composer" }).evaluate((form) => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });

  await expect(page.getByRole("progressbar", { name: "Image generation progress" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Image ready" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("img", { name: "Generated result for A violet observatory above the clouds" })).toBeVisible();
  await expect(page.getByText("completed · 100% · 1 credits")).toBeVisible();

  expect(statusChecks).toBe(1);
  expect(submissions).toBe(1);
  expect(submittedPayload).toMatchObject({
    workflow: "text-to-image",
    model: "google/nano-banana-2",
    prompt: "A violet observatory above the clouds",
    params: {
      aspect_ratio: "1:1",
      resolution: "1K",
      output_format: "jpg",
      variations: 1,
    },
  });
});

test("normalizes an existing API failure for Studio V2", async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    "POST /api/v1/generate": {
      id: "prediction-v2-failed",
      status: "failed",
      error: "The image service could not complete this request.",
      credits_charged: 0,
    },
  });

  await page.goto("/studio-v2");
  await page.getByLabel("What do you want to create?").fill("An impossible image");
  await page.getByRole("button", { name: "Create image" }).click();

  await expect(page.getByRole("heading", { name: "Generation failed" })).toBeVisible();
  await expect(page.getByText("The image service could not complete this request.")).toBeVisible();
  await expect(page.getByText("Review your account or request before trying again.")).toBeVisible();
  await expect(page.getByText("failed · 5% · 0 credits")).toBeVisible();
});

test("preserves non-retryable backend error metadata", async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    "POST /api/v1/generate": async (route) => {
      await route.fulfill({
        status: 402,
        contentType: "application/json",
        body: JSON.stringify({ error: "Insufficient credits", code: "insufficient_credits" }),
      });
    },
  });

  await page.goto("/studio-v2");
  await page.getByLabel("What do you want to create?").fill("A costly image");
  await page.getByRole("button", { name: "Create image" }).click();

  const failedGeneration = page.locator("[data-error-code='insufficient_credits']");
  await expect(failedGeneration).toBeVisible();
  await expect(failedGeneration).toContainText("Insufficient credits");
  await expect(failedGeneration).toContainText("Review your account or request before trying again.");
});

test("normalizes local tracking cancellation without another status request", async ({ page }) => {
  let statusChecks = 0;
  await authenticate(page);
  await mockApi(page, {
    "POST /api/v1/generate": {
      id: "prediction-v2-cancel-button",
      status: "processing",
      credits_charged: 1,
    },
    "GET /api/v1/predictions/prediction-v2-cancel-button": async (route) => {
      statusChecks += 1;
      await route.fulfill({ json: { id: "prediction-v2-cancel-button", status: "processing" } });
    },
  });

  await page.goto("/studio-v2");
  await page.getByLabel("What do you want to create?").fill("A generation to stop tracking");
  await page.getByRole("button", { name: "Create image" }).click();
  await page.getByRole("button", { name: "Cancel tracking" }).click();

  await expect(page.getByRole("heading", { name: "Tracking cancelled" })).toBeVisible();
  await expect(page.getByText("cancelled · 15% · 1 credits")).toBeVisible();
  expect(statusChecks).toBe(0);
});

test("stops generation polling when Studio V2 is left", async ({ page }) => {
  let statusChecks = 0;
  await authenticate(page);
  await mockApi(page, {
    "POST /api/v1/generate": {
      id: "prediction-v2-cancelled",
      status: "processing",
      credits_charged: 1,
    },
    "GET /api/v1/predictions/prediction-v2-cancelled": async (route) => {
      statusChecks += 1;
      await route.fulfill({ json: { id: "prediction-v2-cancelled", status: "processing" } });
    },
  });

  await page.goto("/studio-v2");
  await page.getByLabel("What do you want to create?").fill("A generation to leave");
  await page.getByRole("button", { name: "Create image" }).click();
  await expect(page.getByRole("progressbar", { name: "Image generation progress" })).toBeVisible();

  await page.goto("/");
  await page.waitForTimeout(2_000);
  expect(statusChecks).toBe(0);
});
