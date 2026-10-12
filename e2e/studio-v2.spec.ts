import { expect, test } from "@playwright/test";

test.describe("Studio V2 foundation", () => {
  test("renders the internal application shell without API calls", async ({ page }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
    });

    await page.goto("/studio-v2");

    await expect(page.getByTestId("studio-v2-shell")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Studio V2 sections" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Studio V2 workspace" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Contextual inspector" })).toBeVisible();
    await expect(page.getByRole("form", { name: "Universal composer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with the creative outcome" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(apiRequests).toEqual([]);
  });

  test("stores composer and workspace interaction state", async ({ page }) => {
    await page.goto("/studio-v2");
    const composer = page.getByLabel("What do you want to create?");
    await composer.fill("A calm product film in morning light");
    await expect(composer).toHaveValue("A calm product film in morning light");
    await page.getByRole("button", { name: "Grid" }).click();
    await expect(page.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
  });
});
