import { test, expect } from "./fixtures";

test("signup form accepts valid input and reveals OTP step", async ({
  page,
}, testInfo) => {
  // Signup triggers a Supabase invite email; Supabase throttles auth emails
  // per-IP (~1/60s). Running this spec on both chromium and mobile back-to-back
  // trips the throttle. Keep it to one project.
  test.skip(
    testInfo.project.name !== "chromium",
    "signup only runs on chromium to avoid Supabase auth-email rate limit"
  );

  const signupCodeRequired = process.env.SIGNUP_CODE_REQUIRED === "true";
  const email = `e2e-signup-${Date.now()}@example.com`;

  if (signupCodeRequired) {
    const code = process.env.SIGNUP_CODE;
    expect(
      code,
      "SIGNUP_CODE must be set in .env.local when SIGNUP_CODE_REQUIRED=true"
    ).toBeTruthy();

    await page.goto(`/join?code=${code}`);
    await expect(page.getByLabel(/Access code/i)).toHaveValue(code!);
    await page.getByLabel(/^Name/i).fill("E2E Signup");
    await page.getByLabel(/^Email$/i).fill(email);
  } else {
    await page.goto("/join");
    await expect(page.getByLabel(/Access code/i)).toHaveCount(0);
    await page.getByLabel(/^Name/i).fill("E2E Signup");
    await page.getByLabel(/^Email$/i).fill(email);
  }

  await page.getByRole("button", { name: /Sign up/i }).click();

  // VerifyOtpForm replaces SignupForm on success
  await expect(page.getByText(/Check your email/i)).toBeVisible();
  await expect(page.getByLabel(/^Code$/i)).toBeVisible();
});
