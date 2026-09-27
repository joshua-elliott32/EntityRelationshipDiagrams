import { expect, test, type Page } from "@playwright/test";

const panel = (page: Page) => page.getByRole("complementary", { name: "Side panel" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("check-status")).toBeVisible();
});

test("opens with the example diagram", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Diagram name" })).toHaveValue("Shop example");
  const p = panel(page);
  await expect(p.getByRole("heading", { name: "Build your diagram" })).toBeVisible();
  for (const name of ["customers", "orders", "products"]) {
    await expect(p.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  // The example has deliberate problems for the checker to find.
  await expect(page.getByTestId("check-status")).toContainText(/issue|Meets/);
});

test("add a table, rename it, mark a foreign key and undo", async ({ page }) => {
  const p = panel(page);
  await page.getByRole("button", { name: "Add table" }).click();

  const tableName = p.getByRole("textbox", { name: "Table name" });
  await expect(tableName).toBeFocused();
  await tableName.fill("invoices");
  await expect(tableName).toHaveValue("invoices");

  await p.getByRole("button", { name: "Add column" }).first().click();
  const newCol = p.getByTestId("column-card").last();
  const colName = newCol.getByRole("textbox", { name: "Column name" });
  await expect(colName).toBeFocused();
  await colName.fill("customer_id");

  const fk = newCol.getByRole("checkbox", { name: "Foreign key" });
  await fk.check();
  await expect(fk).toBeChecked();
  await expect(newCol.getByText("→ customers.customer_id")).toBeVisible();
  await expect(p.getByRole("button", { name: "customers 1:N invoices" })).toBeVisible();

  // Undo removes the relationship again (typing is its own undo step).
  const link = p.getByRole("button", { name: "customers 1:N invoices" });
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(link).toHaveCount(0);
  await expect(fk).not.toBeChecked();

  const redo = page.getByRole("button", { name: "Redo" });
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(link).toBeVisible();

  // Ctrl/⌘+Z works too while focus isn't in a text field.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(link).toHaveCount(0);
});

test("settings switch between light and dark themes", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("radio", { name: "Light" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await dialog.getByRole("radio", { name: "Dark" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // The choice survives a reload (inline script + persisted settings).
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("export menu opens and lists the formats", async ({ page }) => {
  await page.getByTestId("export-menu").click();
  const menu = page.getByRole("menu", { name: "Export" });
  await expect(menu).toBeVisible();
  for (const item of ["Image (.png)", "Vector image (.svg)", "Excel workbook (.xlsx)", "SQL…"]) {
    await expect(menu.getByRole("menuitem", { name: new RegExp(escape(item)) })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // A text export opens in a dialog.
  await page.getByTestId("export-menu").click();
  await page.getByRole("menuitem", { name: /Mermaid/ }).click();
  await expect(page.getByRole("dialog", { name: /Export Mermaid/ })).toBeVisible();
});

test("checks tab and keyboard shortcuts", async ({ page }) => {
  await page.getByTestId("check-status").click();
  await expect(page.getByRole("tab", { name: /Checks/ })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Edit" }).click();
  await page.keyboard.press("n");
  await expect(panel(page).getByRole("textbox", { name: "Table name" })).toBeFocused();

  // Single-key shortcuts are ignored while typing, so move focus out first.
  await page.getByRole("tab", { name: "Edit" }).focus();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
});

test("a share link opens the diagram in a fresh browser", async ({ page, browser }) => {
  await page.getByRole("textbox", { name: "Diagram name" }).fill("Shared shop");
  await page.getByRole("button", { name: "Share" }).click();
  const url = await page.getByRole("textbox", { name: "Share link" }).inputValue();
  expect(url).toContain("#");

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(url);
  await expect(p2.getByRole("textbox", { name: "Diagram name" })).toHaveValue("Shared shop");
  await expect(p2.getByText(/from a shared link/)).toBeVisible();
  await expect.poll(() => new URL(p2.url()).hash).toBe("");
  await other.close();
});

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("opening a share link keeps your own diagram one Undo away", async ({ page, browser }) => {
  await page.getByRole("textbox", { name: "Diagram name" }).fill("Their diagram");
  await page.getByRole("button", { name: "Share" }).click();
  const url = await page.getByRole("textbox", { name: "Share link" }).inputValue();

  // Someone else's browser, with their own work already saved.
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto("/");
  await p2.getByRole("textbox", { name: "Diagram name" }).fill("My own work");
  await p2.waitForTimeout(600); // let autosave run

  await p2.goto(url);
  await expect(p2.getByRole("textbox", { name: "Diagram name" })).toHaveValue("Their diagram");
  await p2.getByRole("button", { name: "Undo" }).last().click();
  await expect(p2.getByRole("textbox", { name: "Diagram name" })).toHaveValue("My own work");
  await other.close();
});
