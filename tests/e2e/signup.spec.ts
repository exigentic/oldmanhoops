import { test, expect } from "./fixtures";

test("signup form accepts valid input and reveals OTP step", async ({ page }) => {
  const code = process.env.SIGNUP_CODE;
  expect(code, "SIGNUP_CODE must be set in .env.local").toBeTruthy();

  const email = `e2e-signup-${Date.now()}@example.com`;
  await page.goto(`/join?code=${code}`);

  // Code input pre-filled from the URL
  await expect(page.getByLabel(/Access code/i)).toHaveValue(code!);

  await page.getByLabel(/^Name/i).fill("E2E Signup");
  await page.getByLabel(/^Email$/i).fill(email);

  await page.getByRole("button", { name: /Sign up/i }).click();

  // VerifyOtpForm replaces SignupForm on success
  await expect(page.getByText(/Check your email/i)).toBeVisible();
  await expect(page.getByLabel(/^Code$/i)).toBeVisible();
});
