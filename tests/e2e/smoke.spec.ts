import { test, expect } from "@playwright/test";

test("homepage shows OldManHoops branding", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "OldManHoops" })).toBeVisible();
});
