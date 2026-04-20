import { test, expect } from "./fixtures";

test("visitor sees count cards but no roster names", async ({ page }) => {
  await page.goto("/");

  // Count cards visible
  await expect(page.getByLabel(/In count/i)).toBeVisible();
  await expect(page.getByLabel(/Maybe count/i)).toBeVisible();
  await expect(page.getByLabel(/Out count/i)).toBeVisible();

  // No roster headings (Roster only renders for logged-in members)
  // Members see H2s labeled "In" / "Maybe" / "Out"
  await expect(page.getByRole("heading", { name: /^In$/, level: 2 })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Maybe$/, level: 2 })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Out$/, level: 2 })).toHaveCount(0);

  // Sign Up button + "Already a member?" link visible
  await expect(page.getByRole("link", { name: /Sign Up to Play/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Already a member\? Log in/i })).toBeVisible();
});
