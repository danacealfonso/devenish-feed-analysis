import { expect, test } from "@playwright/test";
import { ACCOUNTS, appAlert, shot, watchErrors } from "./helpers";

test.describe("signed-out pages", () => {
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
    await expect(appAlert(page)).toContainText("don’t match an account");
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
