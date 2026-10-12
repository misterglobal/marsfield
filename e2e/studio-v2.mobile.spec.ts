import { expect, test } from "@playwright/test";
import { authenticate, mockApi } from "./fixtures";

test("Studio V2 fits mobile and exposes navigation and inspector controls", async ({ page }) => {
  await authenticate(page);
  await mockApi(page);
  await page.goto("/studio-v2");

  await expect(page.getByTestId("studio-v2-shell")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const navigationButton = page.getByRole("button", { name: "Open Studio navigation" });
  await navigationButton.click();
  await expect(navigationButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Studio V2 sections" })).toBeVisible();

  const inspectorButton = page.getByRole("button", { name: "Open contextual inspector" });
  await inspectorButton.click();
  await expect(inspectorButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("complementary", { name: "Contextual inspector" })).toBeVisible();
});
