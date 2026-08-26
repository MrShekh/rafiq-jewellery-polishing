import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3600";

function step(name) {
  console.log(`\n=== ${name} ===`);
}

const errors = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  step("First run wizard");
  await page.goto(BASE + "/");
  await page.waitForURL("**/first-run");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByLabel("Business name").fill("Sri Balaji Polishing Works");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Test Owner");
  await page.getByLabel("Username").fill("owner");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: "Open Order Registry" }).click({ timeout: 10000 });
  await page.waitForURL("**/orders");
  console.log("Landed on Order Registry after first-run ✓");

  step("Add a customer inline and an order");
  await page.getByRole("button", { name: "Add Order" }).click();
  // NOTE: the draft-row Combobox has `autoOpen` set, so the popover is
  // already open as soon as the draft row renders - do NOT click the
  // trigger button here, that would just toggle it closed again.
  await page.getByPlaceholder("Search...").waitFor({ state: "visible", timeout: 5000 });
  await page.getByPlaceholder("Search...").fill("ABC Jewellers");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/combobox-filled.png" });
  await page.locator("button", { hasText: "Add new customer" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/customer-dialog.png" });
  await page.getByLabel("Name").fill("ABC Jewellers");
  await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Add customer" }).click();
  await page.waitForTimeout(1500);

  const orderCreated = await page.locator("text=/Order .* added\\./").isVisible().catch(() => false);
  console.log("Order created toast visible:", orderCreated);

  step("Edit weight fields and check auto-calculation");
  await page.waitForTimeout(500);
  const row = page.locator("tbody tr").first();
  // Column order: Date, Customer, Item, Pieces, Weight In, Weight Out, Making Charge, Loss, Touch, Fine Total
  const weightInCell = row.locator("td").nth(4);
  const weightOutCell = row.locator("td").nth(5);
  const makingChargeCell = row.locator("td").nth(6);
  const touchCell = row.locator("td").nth(8);

  await weightInCell.click();
  await page.keyboard.type("25.500");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(400);

  await weightOutCell.click();
  await page.keyboard.type("25.100");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(400);

  await makingChargeCell.click();
  await page.keyboard.type("0.100");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(400);

  await touchCell.click();
  await page.keyboard.type("75");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(600);

  await page.screenshot({ path: "/tmp/after-weights.png" });
  const rowText = await row.textContent();
  console.log("Row after entering weights:", rowText?.replace(/\s+/g, " ").trim());
  // Expected: Loss = 25.500 - 25.100 - 0.100 = 0.300 ; Fine Total = 0.300 * 75 / 100 = 0.225
  console.log("Loss shows 0.300:", rowText?.includes("0.300"));
  console.log("Fine total shows 0.225:", rowText?.includes("0.225"));

  step("Check Dashboard");
  await page.goto(BASE + "/dashboard");
  await page.waitForTimeout(1000);
  const dashboardText = await page.textContent("body");
  console.log("Dashboard loaded, contains 'Today':", dashboardText?.includes("Today"));

  step("Check Customers page");
  await page.goto(BASE + "/customers");
  await page.waitForTimeout(1000);
  const customersText = await page.textContent("body");
  console.log("Customers page shows ABC Jewellers:", customersText?.includes("ABC Jewellers"));

  step("Check Settings page");
  await page.goto(BASE + "/settings");
  await page.waitForTimeout(1000);
  const settingsText = await page.textContent("body");
  console.log("Settings page loaded, contains 'Cloud sync':", settingsText?.includes("sync") || settingsText?.includes("Sync"));

  await browser.close();

  console.log("\n=== Console/page errors captured ===");
  if (errors.length === 0) {
    console.log("None ✓");
  } else {
    errors.forEach((e) => console.log(e));
  }
})().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
