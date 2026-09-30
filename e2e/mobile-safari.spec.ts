import { expect, test } from "@playwright/test";
import { login, watchErrors } from "./helpers";

test("iPhone Safari: every main page loads cleanly and fits the screen", async ({ page }) => {
  const errors = watchErrors(page);
  await login(page, "nutritionist");
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  // No hover on a phone, so the ✨ icons are always shown.
  const icon = page.locator("#attention").locator("xpath=ancestor::section").getByRole("button", { name: "Ask AI about this flag" }).first();
  await expect(icon).toHaveCSS("opacity", "1");
  expect(await fits()).toBe(0);

  // Move around with the menu, as a person would.
  for (const name of ["Questions", "Data", "Notifications"]) {
    await page.getByRole("link", { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    expect(await fits(), `${name} scrolls sideways`).toBe(0);
  }
  // No web push here: the page says so instead of offering a button that can't work.
  await expect(page.getByText("This browser can’t receive push notifications.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on push notifications" })).toHaveCount(0);
  // No account row on a phone: Sign out is the last item of the menu.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/); // may carry ?next= back to the page they were on
  expect(errors).toEqual([]);
});
