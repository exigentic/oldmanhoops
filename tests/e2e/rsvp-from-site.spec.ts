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
