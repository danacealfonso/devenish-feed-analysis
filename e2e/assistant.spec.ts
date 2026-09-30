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

  test("flag filters, and AI icons on flags and matrix cells send to the panel", async ({ page }) => {
    const errors = watchErrors(page);
    const asked: string[] = [];
    // Stub the model so this runs free; we only check what the page sends and shows.
    await page.route("**/functions/v1/assistant", async (route) => {
      const body = route.request().postDataJSON() as { messages: { content: string }[] };
      asked.push(body.messages[body.messages.length - 1].content);
      await route.fulfill({ status: 200, contentType: "text/plain", body: "Stubbed explanation." });
    });
    await login(page, "nutritionist");
    await chooseCustomer(page, "Customer D");

    const attention = page.locator("#attention").locator("xpath=ancestor::section");
    const items = attention.getByRole("listitem");
    await expect(items.first()).toBeVisible();
    await attention.getByRole("button", { name: /action$/ }).click();
    await expect(attention.getByText(/\d+ of \d+ shown/)).toBeVisible();
    for (const t of await items.locator("p.font-semibold").allInnerTexts()) expect(t).toMatch(/^Action:\s/);
    await attention.getByRole("button", { name: "Clear filters" }).click();

    await items.first().hover();
    await items.first().getByRole("button", { name: "Ask AI about this flag" }).click();
    const panel = page.getByRole("complementary", { name: "AI assistant" });
    await expect(panel.getByText("Stubbed explanation.")).toBeVisible();
    expect(asked[0]).toContain("Needs attention");

    await panel.getByRole("button", { name: "Close assistant" }).click();
    const cell = page.getByRole("cell").filter({ has: page.getByRole("button", { name: "Ask AI about Ca", exact: true }) }).first();
    await cell.hover();
    await cell.getByRole("button", { name: "Ask AI about Ca" }).click();
    await expect(panel.getByText(/^Explain Ca:/)).toBeVisible();
    expect(asked[1]).toContain("Calcium");
    await shot(page, "assistant-ask-ai");
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
