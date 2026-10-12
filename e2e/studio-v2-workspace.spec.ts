import { expect, test } from "@playwright/test";
import { authenticate, mockApi } from "./fixtures";

const project = {
  id: "project-studio-v2",
  name: "Autumn campaign",
  description: "Seasonal launch",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
};

const asset = {
  id: "asset-studio-v2",
  projectId: project.id,
  type: "image",
  url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='orange'/%3E%3C/svg%3E",
  thumbnailUrl: null,
  storageObjectId: "storage-studio-v2",
  predictionId: "prediction-source",
  prediction: { prompt: "Orange campaign reference" },
  createdAt: "2026-10-12T00:00:00.000Z",
};

test("restores project, asset context, and composer draft", async ({ page }) => {
  await authenticate(page);
  await mockApi(page, {
    "GET /api/v1/projects": [project],
    "GET /api/v1/assets": async (route) => {
      const selectedProject = new URL(route.request().url()).searchParams.get("project_id");
      await route.fulfill({ json: selectedProject === project.id ? [asset] : [] });
    },
  });

  await page.goto("/studio-v2");
  await page.getByRole("button", { name: project.name }).click();
  await expect(page.getByRole("heading", { name: project.name, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Orange campaign reference" }).click();
  await expect(page.getByRole("complementary", { name: "Contextual inspector" }).getByText("Ready")).toBeVisible();
  await page.getByLabel("What do you want to create?").fill("Keep this creative draft");

  await page.reload();

  await expect(page.getByRole("heading", { name: project.name, level: 1 })).toBeVisible();
  await expect(page.getByLabel("What do you want to create?")).toHaveValue("Keep this creative draft");
  await expect(page.getByRole("button", { name: project.name })).toHaveAttribute("aria-pressed", "true");
});

test("passes selected project and owned image reference to unified generation", async ({ page }) => {
  let generationPayload: Record<string, unknown> | undefined;
  await authenticate(page);
  await mockApi(page, {
    "GET /api/v1/projects": [project],
    "GET /api/v1/assets": [asset],
    "POST /api/v1/generate": async (route) => {
      generationPayload = route.request().postDataJSON();
      await route.fulfill({ json: { id: "prediction-new", status: "failed", error: "Mocked stop", credits_charged: 0 } });
    },
  });

  await page.goto("/studio-v2");
  await page.getByRole("button", { name: project.name }).click();
  await page.getByRole("button", { name: "Orange campaign reference" }).click();
  await page.getByLabel("What do you want to create?").fill("Create from this reference");
  await page.getByRole("button", { name: "Create image" }).click();
  await expect(page.getByRole("heading", { name: "Generation failed" })).toBeVisible();

  expect(generationPayload).toMatchObject({
    project_id: project.id,
    params: { reference_image_ids: [asset.storageObjectId] },
  });
});

test("does not allow non-image assets to become generation references", async ({ page }) => {
  const videoAsset = {
    ...asset,
    id: "asset-video",
    type: "video",
    prediction: { prompt: "Campaign motion reference" },
  };

  await authenticate(page);
  await mockApi(page, {
    "GET /api/v1/projects": [project],
    "GET /api/v1/assets": [videoAsset],
  });

  await page.goto("/studio-v2");
  await page.getByRole("button", { name: project.name }).click();

  await expect(page.getByRole("button", { name: "Campaign motion reference" })).toBeDisabled();
  await expect(page.getByRole("form", { name: "Universal composer" })).toContainText("No references attached");
  await expect(page.getByRole("complementary", { name: "Contextual inspector" }).getByText("project", { exact: true })).toBeVisible();
});
