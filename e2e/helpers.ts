import { expect, type Page } from "@playwright/test";

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

export async function login(page: Page, who: AccountKey) {
  const { email, password } = ACCOUNTS[who];
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
