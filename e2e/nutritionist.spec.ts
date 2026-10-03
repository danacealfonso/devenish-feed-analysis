import { expect, test } from "@playwright/test";
import { chooseCustomer, login, shot, watchErrors } from "./helpers";

test.describe("nutritionist", () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = watchErrors(page);
    await login(page, "nutritionist");
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test("feed page: headline cards, flags, matrix, spread and stats", async ({ page }) => {
    await chooseCustomer(page, "Customer D");
    await expect(page.getByText("Customer D · Feed quality")).toBeVisible();
    await expect(page.getByText("median % of intended")).toHaveCount(4);
    await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    await expect(page.locator("#attention").locator("xpath=ancestor::section").getByRole("listitem").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Analyzed vs intended by diet" })).toBeVisible();
    await expect(page.getByRole("rowgroup").getByText("Location 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Spread of results" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Summary statistics" })).toBeVisible();
    await shot(page, "feed-customer-d");

    // Filters narrow the matrix.
    await page.getByLabel("Location").selectOption({ label: "Location 2" });
    await expect(page.getByRole("rowgroup").getByText("Location 1", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("rowgroup").getByText("Location 2", { exact: true })).toBeVisible();
    await page.getByLabel("Source").selectOption("nir");
    await expect(page.getByText("No samples match these filters.")).toBeVisible();
    await page.getByLabel("Source").selectOption("all");

    // Expand history.
    await page.getByRole("button", { name: "Expand all" }).click();
    await expect(page.getByRole("button", { name: "Collapse all" })).toBeVisible();
  });

  test("diet detail page opens from the matrix with charts", async ({ page }) => {
    await chooseCustomer(page, "Customer A");
    await page.locator("table").getByRole("link").first().click();
    await page.waitForURL("**/feed/diet?**");
    await expect(page.getByText("% of intended over time")).toBeVisible();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "All samples" })).toBeVisible();
    await shot(page, "diet-detail");
  });

  test("overview, dashboard and compare", async ({ page }) => {
    await chooseCustomer(page, "Customer F");
    await page.getByRole("link", { name: "Overview" }).click();
    await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Site F1" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent uploads" })).toBeVisible();
    await shot(page, "overview");

    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByText("Not provided")).toHaveCount(4);
    await expect(page.locator(".recharts-wrapper")).toHaveCount(2);
    await shot(page, "dashboard");

    await page.getByRole("link", { name: "Compare my flocks" }).click();
    await expect(page.getByRole("heading", { name: "Compare my flocks", exact: true })).toBeVisible();
    await expect(page.locator(".recharts-wrapper")).toHaveCount(1);
    await page.getByRole("radio", { name: "Flock phase" }).click();
    await expect(page.getByRole("rowheader", { name: "Layer" })).toBeVisible();
    await page.getByRole("radio", { name: "Feed mill" }).click();
    await expect(page.getByRole("rowheader", { name: "Mill F-North" })).toBeVisible();
    await shot(page, "compare");
  });

  test("data page: upload history, sheet details and CSV export", async ({ page }) => {
    await chooseCustomer(page, "Customer D");
    await page.getByRole("link", { name: "Data" }).click();
    await expect(page.getByRole("heading", { name: "Upload history" })).toBeVisible();
    await page.getByRole("button", { name: /Sample Data\.xlsx/ }).first().click();
    await expect(page.getByText("Analyses vs intended").first()).toBeVisible();
    await expect(page.getByText("don't follow its own header formula")).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export all results (CSV)" }).click(),
    ]);
    const path = await download.path();
    const csv = (await import("node:fs")).readFileSync(path!, "utf8");
    expect(csv.split("\n")[0]).toContain("CP % of intended");
    expect(csv.split("\n").length).toBe(71); // header + 70 Customer D samples
    await shot(page, "data");
  });

  test("questions, reports and operation", async ({ page }) => {
    await chooseCustomer(page, "Customer A");
    await page.getByRole("link", { name: "Questions" }).click();
    await page.getByRole("button", { name: "New question" }).click();
    await expect(page.getByRole("heading", { name: "New question" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await shot(page, "questions");

    await page.getByRole("link", { name: "Reports" }).click();
    await expect(page.getByText("DEVENISH · FEED QUALITY REPORT")).toBeVisible();
    await expect(page.getByText(/Summary · \d+ samples/)).toBeVisible();
    await shot(page, "reports");

    await page.getByRole("link", { name: "Operation" }).click();
    await expect(page.getByLabel("Location name").first()).toBeEnabled();
    await expect(page.getByPlaceholder("New location name")).toBeVisible();
    await shot(page, "operation-nutritionist");

    await page.getByRole("link", { name: /Team & access/ }).click();
    await expect(page.getByRole("heading", { name: "People with access" })).toBeVisible();
    await expect(page.getByText("kanamits2@gmail.com")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Nutritionist/ })).toBeVisible();
    await shot(page, "team");

    await page.goto("/settings/tolerances");
    await expect(page.getByLabel("Calcium Action below")).toBeEnabled();
    await expect(page.getByRole("button", { name: "Save tolerances" })).toBeVisible();
  });

  test("ask about a flag pre-fills a question", async ({ page }) => {
    await chooseCustomer(page, "Customer D");
    await page.getByRole("link", { name: "Ask about this" }).first().click();
    await page.waitForURL("**/questions?**");
    await expect(page.getByLabel("Subject")).not.toHaveValue("");
    await expect(page.getByLabel("Question", { exact: true })).toHaveValue(/What should we do about this\?/);
  });

  test("preview as customer makes settings read-only", async ({ page }) => {
    await page.getByRole("switch", { name: /Preview as customer/ }).check();
    await expect(page.getByText("previewing customer view")).toBeVisible();
    await page.getByRole("link", { name: "Operation" }).click();
    await expect(page.getByText("managed by your Devenish nutritionist")).toBeVisible();
    await expect(page.getByLabel("Location name").first()).toBeDisabled();
    await shot(page, "operation-preview");
    await page.getByRole("switch", { name: /Preview as customer/ }).uncheck();
    await expect(page.getByLabel("Location name").first()).toBeEnabled();
  });

  test("first visit shows a guided tour of the Feed page, and it can be replayed", async ({ page }) => {
    // login() marks the tour as seen; undo that for this test, then reload as a first-time visitor.
    await page.addInitScript(() => localStorage.removeItem("devenish.tourSeen.v3"));
    await page.reload();
    const tour = page.getByRole("dialog", { name: "How is the feed doing?" });
    await expect(tour).toBeVisible();
    await expect(tour.getByText("Step 1 of 6")).toBeVisible();
    for (const title of ["What needs attention", "Every diet, every nutrient", "Ask the AI", "Add new results", "Need a reminder?"]) {
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByRole("dialog", { name: title })).toBeVisible();
    }
    await shot(page, "tour-last-step");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Take the tour" }).click();
    await expect(page.getByRole("dialog", { name: "How is the feed doing?" })).toBeVisible();
    await page.getByRole("button", { name: "Skip tour" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("analyzed vs intended: click a box for a plain explanation, and filter to diets that need attention", async ({ page }) => {
    await chooseCustomer(page, "Customer A");
    const matrix = page.locator("#matrix").locator("xpath=ancestor::section");
    await expect(matrix.getByRole("columnheader", { name: /Calcium/ })).toContainText("% of recipe");
    await expect(matrix.getByRole("list", { name: "Colour key" })).toContainText("Far below");
    // Every diet row says what it needs.
    await expect(matrix.locator("[data-diet-status]").first()).toHaveText(/need(s)? action|to watch|On target|Check data/);

    await matrix.getByRole("button", { name: /^Calcium: \d+% of recipe, far below target/ }).first().click();
    const explain = page.getByRole("dialog");
    await expect(explain.getByRole("heading", { name: /% of recipe/ })).toBeVisible();
    await expect(explain).toContainText(/The (lab|NIR scanner) measured .* calcium; the recipe called for .*\. That’s \d+% below target\. That’s far enough off to act on\./);
    await expect(explain).toContainText("Why it matters: calcium affects eggshell strength");
    await expect(explain.getByRole("button", { name: "Ask AI about this" })).toBeVisible();
    await expect(explain.getByRole("link", { name: "View diet history" })).toBeVisible();
    await shot(page, "matrix-explain");
    await page.keyboard.press("Escape");
    await expect(explain).toHaveCount(0);

    const toggle = matrix.getByRole("switch", { name: /Only diets that need action/ });
    const [, needing, total] = (await toggle.locator("xpath=..").innerText()).match(/\((\d+) of (\d+)\)/)!.map(Number);
    expect(needing).toBeLessThan(total);
    await toggle.check();
    // Only diets with something far off target (or a number to check) remain.
    const chips = matrix.locator("[data-diet-status]");
    await expect(chips).toHaveCount(needing);
    for (const t of await chips.allInnerTexts()) expect(t).toMatch(/need(s)? action|Check data/);
    await toggle.uncheck();
  });

  test("“What do these mean?” explains the page in plain words", async ({ page }) => {
    await page.getByRole("button", { name: "What do these mean?" }).click();
    const help = page.getByRole("dialog", { name: "What the Feed page shows" });
    await expect(help.getByText("“% of intended”")).toBeVisible();
    await expect(help.getByText("Far enough below to matter for the hens.", { exact: false })).toBeVisible();
    await expect(help.getByRole("table")).toContainText("Calcium");
    await expect(help.getByRole("definition").filter({ hasText: "Crude protein" })).toContainText("egg mass and egg weight");
    await shot(page, "help-glossary");
    await page.keyboard.press("Escape");
    await expect(help).toHaveCount(0);
  });

  test("feed page fits a phone screen without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Feed analysis" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await shot(page, "feed-mobile");
  });
});
