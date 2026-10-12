import { expect, test } from "@playwright/test";
import { authenticate, mockApi } from "./fixtures";

test("contains a Studio V2 render failure and preserves legacy Studio", async ({ page }) => {
  await authenticate(page);
  await mockApi(page);

  await page.goto("/studio-v2?simulateFailure=1");

  await expect(page.getByTestId("studio-v2-error-boundary")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Studio V2 couldn't load" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);

  await page.getByRole("link", { name: "Return to legacy Studio" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("complementary").first()).toContainText("Marsfield");
  await expect(page.getByText("Studio Creative Workspace", { exact: true })).toBeVisible();
});
