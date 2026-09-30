import { expect, test } from "@playwright/test";
import { ACCOUNTS, appAlert, shot, stubHumanCheck, watchErrors } from "./helpers";

test.describe("signed-out pages", () => {
  test.beforeEach(async ({ page }) => stubHumanCheck(page));

  test("portal pages redirect to sign-in", async ({ page }) => {
    await page.goto("/feed");
    await page.waitForURL("**/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("sign-in rejects a wrong password with a clear message", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(ACCOUNTS.farm.email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Once the server checks CAPTCHAs, the test stand-in's answer is refused before the password is checked.
    await expect(appAlert(page)).toContainText(/don’t match an account|human check didn’t go through/);
    await shot(page, "login-error");
    // Supabase answers 400 for bad credentials; the browser logs that as a failed request, which is expected here.
    expect(errors.filter((e) => !e.includes("400"))).toEqual([]);
  });

  test("password field has a show/hide toggle", async ({ page }) => {
    await page.goto("/login");
    const pw = page.getByLabel("Password", { exact: true });
    await expect(pw).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(pw).toHaveAttribute("type", "text");
  });

  test("sign-up page, including an invitation link", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/signup?email=invitee%40farm.test");
    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByLabel("Work email")).toHaveValue("invitee@farm.test");
    await expect(page.getByText("You’ve been invited")).toBeVisible();
    // Client-side validation, no account is created.
    await page.getByLabel("Full name").fill("Test Person");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(appAlert(page)).toContainText("at least 8 characters");
    await page.getByLabel("Password", { exact: true }).fill("longenough1");
    await page.getByLabel("Confirm password").fill("different99");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(appAlert(page)).toContainText("don’t match");
    await shot(page, "signup");
    expect(errors).toEqual([]);
  });

  test("sign-in, sign-up and reset forms ask for the human check", async ({ page }) => {
    await page.route("https://challenges.cloudflare.com/turnstile/**", (r) =>
      r.fulfill({ contentType: "application/javascript", body: "window.turnstile={render(el){el.textContent='Verify you are human';return 'w'},reset(){},remove(){}};" }),
    );
    for (const [path, button] of [["/login", "Sign in"], ["/signup", "Create account"], ["/forgot-password", "Send reset link"]] as const) {
      await page.goto(path);
      await expect(page.getByText("Verify you are human")).toBeVisible();
      if (path === "/signup") {
        await page.getByLabel("Full name").fill("Test Person");
        await page.getByLabel("Password", { exact: true }).fill("longenough1");
        await page.getByLabel("Confirm password").fill("longenough1");
      }
      await page.getByLabel(/^(Email|Work email)$/).fill("nobody@farm.test");
      if (path === "/login") await page.getByLabel("Password", { exact: true }).fill("whatever1");
      await page.getByRole("button", { name: button }).click();
      await expect(appAlert(page)).toContainText("Please tick “Verify you are human” first.");
    }
  });

  test("forgot-password page renders", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await shot(page, "forgot-password");
  });

  test("unknown pages show a 404", async ({ page }) => {
    const res = await page.goto("/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
