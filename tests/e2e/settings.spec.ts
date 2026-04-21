import { test, expect } from "./fixtures";

test("member updates their display name and toggles off email reminders", async ({
  page,
  authedUser,
}) => {
  await page.goto("/settings");

  await expect(
    page.getByRole("heading", { name: /^Settings$/i, level: 1 })
  ).toBeVisible();

  // Email field is pre-filled.
  await expect(page.getByLabel(/^Email$/i)).toHaveValue(authedUser.email);

  // Change the name.
  const newName = `Updated-${Date.now()}`;
  const nameInput = page.getByLabel(/Display name/i);
  await nameInput.fill(newName);
  await page.getByRole("button", { name: /Save name/i }).click();

  // "Saved ✓" appears (live region)
  await expect(page.getByText(/Saved ✓/i).first()).toBeVisible();

  // Reload and confirm the name persisted.
  await page.reload();
  await expect(page.getByLabel(/Display name/i)).toHaveValue(newName);

  // Toggle email reminders OFF.
  const reminder = page.getByLabel(/Email reminders/i);
  await expect(reminder).toBeChecked();
  await reminder.click();
  await expect(page.getByText(/Saved ✓/i).first()).toBeVisible();

  // Reload — still unchecked.
  await page.reload();
  await expect(page.getByLabel(/Email reminders/i)).not.toBeChecked();
});

test("member adds, persists, and clears a phone number", async ({
  page,
  authedUser: _authedUser,
}) => {
  await page.goto("/settings");

  const phoneInput = page.getByLabel(/^Phone$/i);
  await expect(phoneInput).toHaveValue("");

  // Fill a human-formatted number and save.
  await phoneInput.fill("(555) 123-4567");
  await page.getByRole("button", { name: /Save phone/i }).click();
  await expect(page.getByText(/Saved ✓/i).first()).toBeVisible();

  // Reload — the server stores the normalized digits; input shows that value.
  await page.reload();
  await expect(page.getByLabel(/^Phone$/i)).toHaveValue("5551234567");

  // Button is disabled until the user edits.
  await expect(page.getByRole("button", { name: /Save phone/i })).toBeDisabled();

  // Clear and save.
  await page.getByLabel(/^Phone$/i).fill("");
  await page.getByRole("button", { name: /Save phone/i }).click();
  await expect(page.getByText(/Saved ✓/i).first()).toBeVisible();

  // Reload — field is empty again.
  await page.reload();
  await expect(page.getByLabel(/^Phone$/i)).toHaveValue("");
});
