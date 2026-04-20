import { test, expect } from "@playwright/test";

test("homepage shows Old Man Hoops branding", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Old Man Hoops" })).toBeVisible();
});
