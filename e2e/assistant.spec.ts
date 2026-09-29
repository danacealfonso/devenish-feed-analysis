import { expect, test } from "@playwright/test";
import { chooseCustomer, login, shot, watchErrors } from "./helpers";

test.describe("AI assistant", () => {
  test("panel opens with suggested questions and closes", async ({ page }) => {
    const errors = watchErrors(page);
    await login(page, "nutritionist");
    await page.getByRole("button", { name: "Ask about this data" }).click();
    const panel = page.getByRole("complementary", { name: "AI assistant" });
    await expect(panel.getByRole("heading", { name: "Feed assistant" })).toBeVisible();
    await expect(panel.getByRole("button", { name: /Which diets need action/ })).toBeEnabled();
    await shot(page, "assistant-open");
    await panel.getByRole("button", { name: "Close assistant" }).click();
    await expect(page.getByRole("button", { name: "Ask about this data" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  // Calls the real model (costs money). Run with: E2E_ASSISTANT=1 npm run e2e -- assistant
  test("answers a question from the customer's data", async ({ page }) => {
    test.skip(!process.env.E2E_ASSISTANT, "set E2E_ASSISTANT=1 to call the live model");
    test.setTimeout(180_000);
    await login(page, "nutritionist");
    await chooseCustomer(page, "Customer D");
    await page.getByRole("button", { name: "Ask about this data" }).click();
    const panel = page.getByRole("complementary", { name: "AI assistant" });
    await panel.getByRole("button", { name: /Which diets need action/ }).click();
    await expect(panel.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 150_000 }); // back to idle
    const answer = await panel.locator(".leading-relaxed").last().innerText();
    expect(answer).not.toMatch(/^\[/); // not an error message
    expect(answer.length).toBeGreaterThan(200);
    expect(answer).toMatch(/Location [12]/);
    await shot(page, "assistant-answer");
  });
});
