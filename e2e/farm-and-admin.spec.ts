import path from "node:path";
import { expect, test } from "@playwright/test";
import { login, shot, watchErrors } from "./helpers";

const WORKBOOK = path.join(__dirname, "..", "tests", "fixtures", "sample-data.xlsx");

test.describe("farm team", () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = watchErrors(page);
    await login(page, "farm");
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test("sees only their own farm, with no admin tools", async ({ page }) => {
    await expect(page.getByLabel("Customer", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Customer A · Feed quality")).toBeVisible();
    await expect(page.getByText("Customer team")).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await expect(page.getByRole("switch")).toHaveCount(0);
    await shot(page, "feed-farm");
  });

  test("settings are read-only", async ({ page }) => {
    await page.getByRole("link", { name: "Operation" }).click();
    await expect(page.getByText("managed by your Devenish nutritionist")).toBeVisible();
    await expect(page.getByLabel("Location name").first()).toBeDisabled();
    await expect(page.getByPlaceholder("New location name")).toHaveCount(0);
    await shot(page, "operation-farm");

    await page.goto("/settings/tolerances");
    await expect(page.getByLabel("Calcium Action below")).toBeDisabled();
    await expect(page.getByText("Read only.")).toBeVisible();

    await page.goto("/operation/team");
    await expect(page.getByRole("radio", { name: /Nutritionist/ })).toHaveCount(0);
    await expect(page.getByText("Nutritionists are added by Devenish.")).toBeVisible();
  });

  test("uploads a lab report through the upload dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Upload feed analysis" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Drop a lab or NIR export here")).toBeVisible();
    await dialog.locator('input[type="file"]').setInputFiles(WORKBOOK);

    // Step 2: every sheet detected; import only the Ex1 lab report into Location B (where it was sampled).
    await expect(dialog.getByText("9 sheets found")).toBeVisible();
    await expect(dialog.getByText("Lab analysis report · 100% match")).toBeVisible();
    await expect(dialog.getByText("NIR vs formula (transposed) · 100% match").first()).toBeVisible();
    for (const box of await dialog.getByRole("checkbox").all()) if (await box.isChecked()) await box.uncheck();
    await dialog.getByRole("checkbox", { name: "Import Ex1 Lab analysis report" }).check();
    await dialog.getByLabel("Location for Ex1 Lab analysis report").selectOption({ label: "Location B" });
    await shot(page, "upload-sheets");
    await dialog.getByRole("button", { name: "Review 1 sheet" }).click();

    // Step 3: review.
    await expect(dialog.getByText("Samples to import")).toBeVisible();
    await expect(dialog.getByText("“///////” placeholder cells treated as not analysed")).toBeVisible();
    await shot(page, "upload-review");
    await dialog.getByRole("button", { name: "Import 4 samples" }).click();

    // Step 4: these 4 lab results are already on file, so they merge instead of duplicating.
    await expect(dialog.getByText("0 new samples imported")).toBeVisible();
    await expect(dialog.getByText("4 matched samples already on file")).toBeVisible();
    await shot(page, "upload-done");
    await dialog.getByRole("button", { name: "Close" }).last().click();
  });
});

test.describe("Devenish admin", () => {
  test("admin console lists every customer", async ({ page }) => {
    const errors = watchErrors(page);
    await login(page, "admin");
    await page.getByRole("link", { name: "Admin" }).click();
    await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
    for (const c of ["Customer A", "Customer D", "Customer F"])
      await expect(page.getByRole("rowheader", { name: new RegExp(c) })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create customer" })).toBeVisible();
    await shot(page, "admin");
    expect(errors).toEqual([]);
  });
});
