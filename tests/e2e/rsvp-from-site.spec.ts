import { test, expect } from "./fixtures";

test("logged-in member can RSVP, add a guest, and save a note", async ({
  page,
  authedUser,
}) => {
  await page.goto("/");

  // The RSVP group is only rendered for logged-in members.
  const rsvpGroup = page.getByRole("group", { name: /Your RSVP status/i });
  await expect(rsvpGroup).toBeVisible();

  // Click the "In" card. Card buttons derive their accessible name from the
  // inner `aria-label="In count"` value + the title text, so we match "in count".
  const inCard = rsvpGroup.getByRole("button", { name: /in count/i });
  await inCard.click();

  // After click, "In" card should be aria-pressed=true.
  await expect(inCard).toHaveAttribute("aria-pressed", "true");

  // Increment guests to 1.
  await page.getByRole("button", { name: /increment guests/i }).click();
  await expect(page.getByLabel(/1 guests/i)).toBeVisible();

  // Type a note and commit via Tab.
  const note = page.getByLabel(/^Note$/i);
  await note.fill("running 5 min late");
  await note.press("Tab");

  // Saved indicator appears (poll live region).
  await expect(page.getByText(/Saved ✓/i).first()).toBeVisible();
});

test("changing an already-set status prompts a confirmation and applies on confirm", async ({
  page,
  authedUser,
}) => {
  await page.goto("/");
  const rsvpGroup = page.getByRole("group", { name: /Your RSVP status/i });
  await expect(rsvpGroup).toBeVisible();

  // Set the initial status (first-time set is instant, no dialog).
  const inCard = rsvpGroup.getByRole("button", { name: /in count/i });
  await inCard.click();
  await expect(inCard).toHaveAttribute("aria-pressed", "true");

  // Switching to a different status opens the confirmation dialog.
  const outCard = rsvpGroup.getByRole("button", { name: /out count/i });
  await outCard.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/you're currently in\. switch to out\?/i);
  // Original status still selected while the dialog is open.
  await expect(inCard).toHaveAttribute("aria-pressed", "true");

  // Confirm applies the change.
  await dialog.getByRole("button", { name: /switch to out/i }).click();
  await expect(dialog).toBeHidden();
  await expect(outCard).toHaveAttribute("aria-pressed", "true");
  await expect(inCard).toHaveAttribute("aria-pressed", "false");
});

test("cancelling the confirmation leaves the original status unchanged", async ({
  page,
  authedUser,
}) => {
  await page.goto("/");
  const rsvpGroup = page.getByRole("group", { name: /Your RSVP status/i });
  await expect(rsvpGroup).toBeVisible();

  const inCard = rsvpGroup.getByRole("button", { name: /in count/i });
  await inCard.click();
  await expect(inCard).toHaveAttribute("aria-pressed", "true");

  const outCard = rsvpGroup.getByRole("button", { name: /out count/i });
  await outCard.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Cancel keeps the original status.
  await dialog.getByRole("button", { name: /keep in/i }).click();
  await expect(dialog).toBeHidden();
  await expect(inCard).toHaveAttribute("aria-pressed", "true");
  await expect(outCard).toHaveAttribute("aria-pressed", "false");
});
