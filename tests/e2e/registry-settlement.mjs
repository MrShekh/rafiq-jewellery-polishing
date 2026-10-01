// Run the real client components against isolated API fixtures; no customer data is touched.
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const require = createRequire(import.meta.url);
const { createServer } = await import(pathToFileURL(require.resolve("vite", { paths: [path.dirname(require.resolve("vitest/package.json"))] })).href);
const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { SWRConfig } from 'swr';
import { Toaster } from 'sonner';
import { OrderRegistryTable } from '/components/order-table/order-registry-table.tsx';
import { CustomerDetail } from '/components/customer/customer-detail.tsx';
import '/app/globals.css';
createRoot(document.getElementById('root')).render(<SWRConfig value={{ dedupingInterval: 0, revalidateOnFocus: false }}><Toaster /><div style={{height: '100vh'}}>{location.pathname === '/orders' ? <OrderRegistryTable /> : <CustomerDetail customerId="customer" />}</div></SWRConfig>);`;

const server = await createServer({
  configFile: false, root, server: { host: "127.0.0.1", port: 0 },
  resolve: { alias: { "@": root } }, esbuild: { jsx: "automatic" },
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [{
    name: "regression-fixture",
    resolveId(id) { if (id === "/__regression.jsx") return id; },
    load(id) { if (id === "/__regression.jsx") return entry; },
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (!["/orders", "/customer"].includes(req.url)) return next();
        res.setHeader("Content-Type", "text/html");
        res.end('<html><body><div id="root"></div><script>window.process = { env: { NODE_ENV: "development" } };</script><script type="module" src="/__regression.jsx"></script></body></html>');
      });
    },
  }],
});

let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
  const errors = [];
  page.on("pageerror", (err) => { errors.push(err.message); console.error(err.message); });
  let patches = [];
  let failNext = false;
  let cleared = false;
  let delay = 700;
  const customer = { id: "customer", name: "Test Customer", isActive: true };
  let rows = [1, 2].map((n) => ({ id: `order${n}`, orderNumber: `ORD-${n}`, orderDate: "2026-09-30", customerId: "customer", customerNameSnapshot: customer.name, item: "Ring", pieces: 1, weightIn: "10.000", weightOut: "9.000", makingCharge: "0.000", touch: "75.00", loss: "1.000", fineTotal: "0.750", clearedAmount: "0.000", clearStatus: "open", weightIn2: null, weightOut2: null, pieces2: null }));
  const totals = { totalPieces: 2, totalWeightIn: "20.000", totalWeightOut: "18.000", totalMakingCharge: "0.000", totalLoss: "2.000", totalFineTotal: "1.500", totalWeightIn2: "0.000", totalWeightOut2: "0.000", totalPieces2: 0, totalCleared: "0.000", totalFineToReturn: "1.500", totalFineToCollect: "0.000" };
  const preview = { token: "a".repeat(64), orderCount: 10, toCollect: "12.000", toReturn: "8.000", amount: "4.000", direction: "collect" };
  let settlementPosts = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === "/api/orders/items") return json({ items: ["Ring"] });
    if (url.pathname === "/api/customers") return json({ customers: [customer] });
    if (url.pathname === "/api/orders") return json({ orders: rows, total: rows.length, totals, page: 1, pageSize: 100, precision: { weight: 3, fine: 3, touch: 2 }, formulaVersion: "v1-standard" });
    if (/^\/api\/orders\/order\d$/.test(url.pathname) && request.method() === "PATCH") {
      const patch = request.postDataJSON();
      patches.push(patch);
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (failNext) { failNext = false; return json({ error: "Test save failed" }, 409); }
      const row = rows.find((r) => r.id === url.pathname.split("/").pop());
      Object.assign(row, patch);
      row.loss = (Number(row.weightIn) - Number(row.weightOut) - Number(row.makingCharge) + Number(row.weightIn2 ?? 0) - Number(row.weightOut2 ?? 0)).toFixed(3);
      row.fineTotal = (Math.abs(Number(row.loss)) * Number(row.touch) / 100).toFixed(3);
      return json({ order: row, warnings: [] });
    }
    if (url.pathname.endsWith("/summary")) return json({ customer, summary: { totalOrders: 10, totalPieces: 10, totalPieces2: 0, totalWeightIn: "100.000", totalWeightOut: "90.000", totalLoss: "10.000", totalFineToCollect: cleared ? "0.000" : "12.000", totalFineToReturn: cleared ? "0.000" : "8.000", totalReturned: cleared ? "20.000" : "0.000" }, history: rows });
    if (url.pathname.endsWith("/settlement")) {
      if (request.method() === "POST") {
        assert.equal(request.postDataJSON().token, preview.token);
        settlementPosts++;
        cleared = true;
        rows = rows.map((row) => ({ ...row, clearStatus: "cleared", clearedAmount: row.fineTotal }));
        return json({ id: "settlement", orderCount: 10 });
      }
      return json({ preview: cleared ? { ...preview, orderCount: 0, amount: "0.000", toCollect: "0.000", toReturn: "0.000", direction: "balanced" } : preview, settlements: cleared ? [{ ...preview, id: "settlement", createdAt: "2026-10-02T09:00:00Z" }] : [] });
    }
    return json({ error: `Unexpected fixture URL: ${url.pathname}` }, 404);
  });
  await page.goto(`${base}/orders`);
  const field = (name, id = "order1") => page.getByRole("spinbutton", { name: `${name} for order ${id}`, exact: true });
  await field("weightIn").waitFor();
  await page.getByRole("button", { name: "+2nd", exact: true }).first().click();
  // The field appears while the artificial slow save is still running.
  await field("weightIn2").waitFor({ timeout: 500 });
  await page.waitForFunction(() => !document.body.textContent.includes("Saving changes..."));
  assert.equal(patches.length, 1);
  assert.deepEqual(patches[0], { weightIn2: "0.000", weightOut2: "0.000", pieces2: 1 });
  assert.equal(await field("makingCharge").isEditable(), true);

  patches = [];
  await field("weightIn").fill("12");
  await field("weightIn").press("Enter");
  assert.equal(await field("weightIn", "order2").evaluate((el) => el === document.activeElement), true);
  await field("weightOut").fill("8");
  await field("weightOut").press("Tab");
  await page.waitForFunction(() => !document.body.textContent.includes("Saving changes..."));
  assert.equal(patches.length, 2, "Enter plus blur must not submit the same edit twice");
  assert.equal(rows[0].weightIn, "12");
  assert.equal(rows[0].weightOut, "8");

  await field("weightIn").fill("99");
  await field("weightIn").press("Escape");
  assert.equal(await field("weightIn").inputValue(), "12");
  assert.equal(patches.length, 2, "Escape must discard without saving");

  failNext = true;
  await field("weightIn").fill("15");
  await field("weightIn").press("Tab");
  await page.waitForFunction(() => !document.body.textContent.includes("Saving changes..."));
  assert.equal(await field("weightIn").inputValue(), "12", "Failed optimistic edit must roll back");
  assert.equal(await page.getByRole("button", { name: "Clear fine", exact: true }).count(), 0);
  await page.screenshot({ path: path.join(os.tmpdir(), "jewellery-registry-regression.png"), fullPage: true });

  await page.goto(`${base}/customer`);
  await page.getByRole("button", { name: "Clear Customer Balance", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /4\.000 g/);
  assert.match(await dialog.innerText(), /10 outstanding orders/);
  await page.screenshot({ path: path.join(os.tmpdir(), "jewellery-settlement-regression.png"), fullPage: true });
  await page.getByRole("button", { name: "Confirm settlement", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(settlementPosts, 1);
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent === "Clear Customer Balance" && b.disabled));
  await page.getByText("Recent settlements", { exact: true }).click();
  assert.match(await page.locator("body").innerText(), /10 orders settled/);
  assert.deepEqual(errors, []);
  console.log("Browser checks passed: immediate second step, one save, rapid weights, Enter/Tab, Escape, rollback, making charge, customer settlement and history.");
  console.log(`Screenshots: ${path.join(os.tmpdir(), "jewellery-registry-regression.png")} and ${path.join(os.tmpdir(), "jewellery-settlement-regression.png")}`);
} finally {
  await browser?.close();
  await server.close();
}
