import { expect, type Page } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://gyjmiqwkubvhqrxoeftd.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_-saFkRMpTnilMo0ND8inDA_fTzfRbBW";
const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

/** Demo accounts, documented in the README. Override with E2E_* env vars. */
export const ACCOUNTS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "danacebboy@gmail.com",
    password: process.env.E2E_ADMIN_PASSWORD ?? "jLx-Bh6C-ypxB*x",
  },
  nutritionist: {
    email: process.env.E2E_NUTRITIONIST_EMAIL ?? "kanamits2@gmail.com",
    password: process.env.E2E_NUTRITIONIST_PASSWORD ?? "euRFJ2yke9zzNDV9",
  },
  farm: {
    email: process.env.E2E_FARM_EMAIL ?? "kanamits3@gmail.com",
    password: process.env.E2E_FARM_PASSWORD ?? "euRFJ2yke9zzNDV9",
  },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

/** Collect uncaught page errors and console errors so every test can assert the page is clean. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * Tests never send real push notifications or emails: the notify function is answered locally.
 * Set E2E_NOTIFY=1 to let them through (they then go to the demo accounts' real inboxes).
 */
export async function stubNotify(page: Page) {
  if (process.env.E2E_NOTIFY) return;
  await page.route("**/functions/v1/notify", async (route) => {
    const body = route.request().postDataJSON() as { type?: string } | null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body?.type === "test" ? { ok: true, detail: "Sent (stubbed in tests)." } : { recipients: 0, sent: { push: 0, email: 0 } }),
    });
  });
}

/**
 * Tests can't tick Cloudflare's "Verify you are human" box (it exists to stop automation), so its script is
 * replaced by one that answers at once. Supabase accepts that answer only while CAPTCHA checking is off on the
 * server; once it's on, login() signs in with E2E_SERVICE_ROLE_KEY instead.
 */
export async function stubHumanCheck(page: Page) {
  await page.route("https://challenges.cloudflare.com/turnstile/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile = {
        render(el, o) { el.textContent = "Human check (test stand-in)"; setTimeout(() => o.callback("e2e-test-token"), 30); return "w1"; },
        reset(id) {}, remove(id) {},
      };`,
    }),
  );
}

/** A real session without the sign-in form: a one-time link made with the server key, redeemed straight away. */
async function sessionFor(email: string): Promise<Session> {
  const admin = createClient(SUPABASE_URL, process.env.E2E_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const anon = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data: verified, error: err } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (err || !verified.session) throw err ?? new Error("no session");
  return verified.session;
}

export async function login(page: Page, who: AccountKey) {
  const { email, password } = ACCOUNTS[who];
  await stubNotify(page);
  await stubHumanCheck(page);
  if (process.env.E2E_SERVICE_ROLE_KEY) {
    const session = await sessionFor(email);
    await page.addInitScript(([k, v]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, v);
    }, [AUTH_STORAGE_KEY, JSON.stringify(session)] as const);
    await page.goto("/feed");
    await expect(page.getByRole("heading", { name: "Feed analysis" })).toBeVisible();
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/feed");
  await expect(page.getByRole("heading", { name: "Feed analysis" })).toBeVisible();
}

/** Switch customer via the sidebar selector (only present for multi-customer users). */
export async function chooseCustomer(page: Page, name: string) {
  const select = page.getByLabel("Customer", { exact: true });
  const options = await select.locator("option").allTextContents();
  const label = options.find((o) => o.startsWith(name));
  if (!label) throw new Error(`Customer ${name} not in ${options.join(", ")}`);
  await select.selectOption({ label });
}

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e-results/screens/${name}.png`, fullPage: true });
}

/** The app's own alert; excludes Next.js's always-present route announcer, which also has role="alert". */
export const appAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
