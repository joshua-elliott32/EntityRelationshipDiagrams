#!/usr/bin/env node
/**
 * Check an ERD Studio diagram file.
 *
 *   node verify-diagram.mjs <diagram.json> [--browser] [--screenshot out.png]
 *
 * Always: structural checks matching src/lib/model/schema.ts (version,
 * unique ids, relationships pointing at real tables/columns, valid values).
 *
 * --browser: also import the file into the built app (`npm run build` first,
 * so ./out exists) the way a user would, report the name, table count and the
 * checker's findings, and save a screenshot. Uses the repo's Playwright; set
 * PLAYWRIGHT_CHROMIUM_PATH to use an already-installed Chromium.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && !a.endsWith(".png"));
const browser = args.includes("--browser");
const shotIdx = args.indexOf("--screenshot");
const shotPath = shotIdx >= 0 ? args[shotIdx + 1] : "diagram-check.png";
if (!file) {
  console.error("Usage: node verify-diagram.mjs <diagram.json> [--browser] [--screenshot out.png]");
  process.exit(2);
}

const text = readFileSync(file, "utf8");
const errors = [];
let d;
try {
  d = JSON.parse(text);
} catch (e) {
  console.error(`error: not valid JSON: ${e.message}`);
  process.exit(1);
}

// ---- structural checks --------------------------------------------------
const COLORS = ["slate", "teal", "blue", "violet", "rose", "amber", "green"];
const CARD = ["1:1", "1:N", "N:M"];
const ACTIONS = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"];
if (d.version !== 2) errors.push(`version should be 2 (got ${d.version})`);
if (!Array.isArray(d.tables)) errors.push("tables must be a list");
if (!Array.isArray(d.rels)) errors.push("rels must be a list");
const tableCols = new Map();
for (const t of d.tables ?? []) {
  if (tableCols.has(t.id)) errors.push(`duplicate table id ${t.id}`);
  if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) errors.push(`${t.name}: x/y must be numbers`);
  if (t.color != null && !COLORS.includes(t.color))
    errors.push(`${t.name}: unknown colour ${t.color}`);
  const ids = new Set();
  for (const c of t.columns ?? []) {
    if (ids.has(c.id)) errors.push(`${t.name}: duplicate column id ${c.id}`);
    ids.add(c.id);
    for (const k of ["pk", "unique", "nullable", "multi"]) {
      if (typeof c[k] !== "boolean") errors.push(`${t.name}.${c.name}: ${k} must be true/false`);
    }
    if (!Array.isArray(c.determinedBy))
      errors.push(`${t.name}.${c.name}: determinedBy must be a list`);
  }
  for (const c of t.columns ?? []) {
    for (const dep of c.determinedBy ?? []) {
      if (!ids.has(dep))
        errors.push(`${t.name}.${c.name}: determinedBy points at unknown column ${dep}`);
    }
  }
  tableCols.set(t.id, ids);
}
const relIds = new Set();
for (const r of d.rels ?? []) {
  const where = `relationship ${r.id}`;
  if (relIds.has(r.id)) errors.push(`duplicate relationship id ${r.id}`);
  relIds.add(r.id);
  if (!tableCols.has(r.from)) errors.push(`${where}: from table ${r.from} not found`);
  if (!tableCols.has(r.to)) errors.push(`${where}: to table ${r.to} not found`);
  if (r.fromCol && !tableCols.get(r.from)?.has(r.fromCol))
    errors.push(`${where}: fromCol ${r.fromCol} not in ${r.from}`);
  if (r.toCol && !tableCols.get(r.to)?.has(r.toCol))
    errors.push(`${where}: toCol ${r.toCol} not in ${r.to}`);
  if (!CARD.includes(r.type)) errors.push(`${where}: type must be one of ${CARD.join(", ")}`);
  for (const k of ["fromOptional", "toOptional"]) {
    if (typeof r[k] !== "boolean") errors.push(`${where}: ${k} must be true/false`);
  }
  for (const k of ["onDelete", "onUpdate"]) {
    if (!ACTIONS.includes(r[k])) errors.push(`${where}: ${k} must be one of ${ACTIONS.join(", ")}`);
  }
}
if (errors.length) {
  for (const e of errors) console.error("error:", e);
  process.exit(1);
}
console.log(`Structure OK: ${d.tables.length} tables, ${d.rels.length} relationships.`);

if (!browser) process.exit(0);

// ---- import into the built app -----------------------------------------
const outDir = resolve("out");
if (!existsSync(join(outDir, "index.html"))) {
  console.error("error: ./out not found. Run `npm run build` in the repo root first.");
  process.exit(1);
}
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".txt": "text/plain",
};
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  let f = join(outDir, p);
  if (!f.startsWith(outDir)) return res.writeHead(403).end();
  if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/`;

const { chromium } = await import("@playwright/test");
const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const b = await chromium.launch(
  exe && !existsSync(chromium.executablePath()) ? { executablePath: exe } : {},
);
try {
  const page = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(base);
  await page.getByRole("button", { name: /^Import/ }).click();
  await page.locator("dialog textarea").first().fill(text);
  await page.locator("dialog").getByRole("button", { name: "Load diagram" }).click();
  const dialogError = await page
    .locator("dialog[open] .err, dialog[open] [role=alert]")
    .first()
    .innerText({ timeout: 1000 })
    .catch(() => "");
  if (dialogError) throw new Error(`The app refused the file: ${dialogError}`);
  await page.waitForTimeout(1500);
  const name = await page.getByRole("textbox", { name: "Diagram name" }).inputValue();
  const status = await page.getByTestId("check-status").innerText();
  await page.getByRole("tab", { name: /Checks/ }).click();
  await page.waitForTimeout(300);
  const checks = await page.getByRole("complementary", { name: "Side panel" }).innerText();
  await page.screenshot({ path: shotPath });
  console.log(`Imported "${name}" into the app. Check status: ${status.trim()}`);
  console.log("--- Checks panel ---\n" + checks.trim());
  console.log(`Screenshot: ${shotPath}`);
  if (pageErrors.length) {
    console.error("Page errors:\n" + pageErrors.join("\n"));
    process.exitCode = 1;
  }
} finally {
  await b.close();
  server.close();
}
