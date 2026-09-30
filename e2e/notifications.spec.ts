import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, chooseCustomer, login, shot, watchErrors } from "./helpers";

/** Deletes a question through the API with the signed-in (nutritionist) user's own session. */
async function deleteQuestion(page: Page, id: string) {
  await page.evaluate(
    async ({ id, url, key }) => {
      const k = Object.keys(localStorage).find((x) => x.endsWith("-auth-token"));
      const token = k ? JSON.parse(localStorage.getItem(k)!).access_token : "";
      await fetch(`${url}/rest/v1/questions?id=eq.${id}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${token}` } });
    },
    { id, url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://gyjmiqwkubvhqrxoeftd.supabase.co", key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_-saFkRMpTnilMo0ND8inDA_fTzfRbBW" },
  );
}

test.describe("notifications", () => {
  test("change where notification emails go", async ({ page }) => {
    const errors = watchErrors(page);
    await login(page, "nutritionist");
    await page.getByRole("link", { name: "Notifications" }).click();
    await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Push notifications" })).toBeVisible();

    const input = page.getByLabel("Send emails to");
    await expect(input).toHaveAttribute("placeholder", ACCOUNTS.nutritionist.email);
    await input.fill("not-an-email");
    await page.getByRole("button", { name: "Save email" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "valid email" })).toBeVisible();

    const alt = ACCOUNTS.nutritionist.email.replace("@", "+feed@");
    await input.fill(alt);
    await page.getByRole("button", { name: "Save email" }).click();
    await expect(page.getByText(`Notifications will be emailed to ${alt}.`)).toBeVisible();
    await page.getByRole("button", { name: "Send a test email" }).click();
    await expect(page.getByText("Sent (stubbed in tests).")).toBeVisible();
    await shot(page, "notifications-settings");

    await page.reload();
    await expect(page.getByLabel("Send emails to")).toHaveValue(alt);
    // Back to the sign-in email.
    await page.getByLabel("Send emails to").fill("");
    await page.getByRole("button", { name: "Save email" }).click();
    await expect(page.getByText(`Notifications will be emailed to ${ACCOUNTS.nutritionist.email}.`)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a new question shows a live badge for the rest of the team", async ({ browser }) => {
    const nutriCtx = await browser.newContext();
    const farmCtx = await browser.newContext();
    const nutri = await nutriCtx.newPage();
    const farm = await farmCtx.newPage();
    const errors = [...watchErrors(nutri), ...watchErrors(farm)];
    let questionId: string | null = null;
    try {
      await login(nutri, "nutritionist");
      await chooseCustomer(nutri, "Customer A");
      // Visiting Questions clears the badge; then wait somewhere else.
      await nutri.getByRole("link", { name: /^Questions/ }).click();
      await expect(nutri.getByRole("heading", { name: "Questions", level: 1 })).toBeVisible();
      await nutri.getByRole("link", { name: /^Feed/ }).click();
      await expect(nutri.getByRole("link", { name: /^Questions/ })).not.toContainText("new");

      await login(farm, "farm");
      await farm.goto("/questions?new=1");
      const subject = `E2E badge check ${Date.now()}`;
      await farm.getByLabel("Subject").fill(subject);
      await farm.getByLabel("Question", { exact: true }).fill("Automated test: please ignore.");
      await farm.getByRole("button", { name: "Post question" }).click();
      await farm.waitForURL(/\/questions\?id=/);
      questionId = new URL(farm.url()).searchParams.get("id");

      // Realtime delivers it to the nutritionist without a reload.
      await expect(nutri.getByRole("link", { name: /^Questions\s*1 new$/ })).toBeVisible({ timeout: 20_000 });
      await shot(nutri, "notifications-badge");
      await nutri.getByRole("link", { name: /^Questions/ }).click();
      const item = nutri.getByRole("region", { name: "Question list" }).getByRole("listitem").filter({ hasText: subject });
      await expect(item.getByLabel("New activity")).toBeVisible();
      await expect(nutri.getByRole("link", { name: /^Questions/ })).not.toContainText("new");
    } finally {
      if (questionId) await deleteQuestion(nutri, questionId);
      await nutriCtx.close();
      await farmCtx.close();
    }
    expect(errors).toEqual([]);
  });
});
