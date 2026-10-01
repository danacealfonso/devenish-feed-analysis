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
    await expect(appAlert(page)).toContainText("at least 10 characters");
    await page.getByLabel("Password", { exact: true }).fill("Hens&Calcium42");
    await page.getByLabel("Confirm password").fill("Hens&Calcium43");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(appAlert(page)).toContainText("don’t match");
    await shot(page, "signup");
    expect(errors).toEqual([]);
  });

  test("sign-up shows a live password checklist and refuses names and weak passwords", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Maria Santos");
    await page.getByLabel("Work email").fill("maria@farm.test");
    const pw = page.getByLabel("Password", { exact: true });
    const rules = page.getByRole("list", { name: "Password requirements" });
    await pw.fill("abc");
    await expect(page.getByText("Too weak")).toBeVisible();
    await expect(rules.getByText("At least 10 characters (not yet)")).toBeAttached();
    await pw.fill("Santos#2026!x");
    await expect(rules.getByText("Doesn’t contain your name or email (not yet)")).toBeAttached();
    await page.route("https://api.pwnedpasswords.com/range/**", (r) => r.fulfill({ contentType: "text/plain", body: "0000000000000000000000000000000000A:3\r\n" }));
    await pw.fill("Hens&Calcium42");
    await expect(page.getByText("Strong", { exact: true })).toBeVisible();
    await expect(rules.getByText("Not found in known data breaches (done)")).toBeAttached();
    for (const label of ["At least 10 characters", "An uppercase letter (A–Z)", "A number (0–9)", "A symbol, such as ! ? # or *"])
      await expect(rules.getByText(`${label} (done)`)).toBeAttached();
    await shot(page, "signup-password-checklist");
  });

  test("sign-up refuses a password found in data breaches", async ({ page }) => {
    const password = "Hens&Calcium42";
    const { createHash } = await import("node:crypto");
    const hex = createHash("sha1").update(password).digest("hex").toUpperCase();
    // Stand-in for the Have I Been Pwned range API: report this password as leaked 1,234 times.
    let asked = "";
    await page.route("https://api.pwnedpasswords.com/range/**", (r) => {
      asked = r.request().url();
      return r.fulfill({ contentType: "text/plain", body: `0000000000000000000000000000000000A:3\r\n${hex.slice(5)}:1234\r\n` });
    });
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Test Person");
    await page.getByLabel("Work email").fill("nobody@farm.test");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    // The checklist flags it while typing, and the form refuses it on submit.
    await expect(page.getByText("Found in data breaches", { exact: true })).toBeVisible();
    await expect(page.getByText("Found in 1,234 data breaches: choose another")).toBeVisible();
    await expect(appAlert(page)).toContainText("appeared in 1,234 data breaches");
    // Only the first 5 characters of the fingerprint leave the browser.
    expect(asked.endsWith(`/range/${hex.slice(0, 5)}`)).toBe(true);
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
        await page.getByLabel("Password", { exact: true }).fill("Hens&Calcium42");
        await page.getByLabel("Confirm password").fill("Hens&Calcium42");
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
