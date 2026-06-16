const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "manual_assets");
const rawDir = path.join(outputDir, "raw");
const metaPath = path.join(outputDir, "screenshots.json");
const baseUrl = "http://localhost:3000";

const profiles = [
  {
    key: "admin",
    identity: "admin",
    password: "admin",
    steps: [
      {
        key: "login",
        path: "/login",
        title: "Inicio de sesion",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'input[name="identity"]' },
          { label: "2", selector: 'input[name="password"]' },
          { label: "3", selector: 'button[type="submit"]' },
        ],
      },
      {
        key: "dashboard",
        path: "/",
        title: "Panel principal",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'a[href="/entries/new"]' },
          { label: "2", selector: 'a[href="/workers"]' },
          { label: "3", selector: 'a[href="/settings"]' },
          { label: "4", selector: 'a[href="/camionetas"]' },
          { label: "5", selector: 'a[href="/notifications"]' },
        ],
      },
      {
        key: "workers",
        path: "/workers",
        title: "Mantenedor de trabajadores",
        fullPage: false,
        highlights: [
          { label: "1", selector: '#workerSearch' },
          { label: "2", selector: 'select[name="role"]' },
          { label: "3", selector: 'form.worker-form button[type="submit"]' },
          { label: "4", selector: 'form[action*="/reset-password"] button' },
        ],
      },
      {
        key: "camionetas_assignments",
        path: "/camionetas?tab=assignments",
        title: "Camionetas - Asignaciones",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'a[href*="tab=assignments"]' },
          { label: "2", selector: '[data-worker-search-input]' },
          { label: "3", selector: '.vehicle-inline-form button[type="submit"]' },
        ],
      },
      {
        key: "camionetas_manage",
        path: "/camionetas?tab=manage",
        title: "Camionetas - Mantencion",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'a[href*="tab=manage"]' },
          { label: "2", selector: 'form[action="/camionetas/create"] input[name="name"]' },
          { label: "3", selector: 'input[name="vehicleResetTime"]' },
          { label: "4", selector: '.vehicle-maintenance-form select, .vehicle-maintenance-form input[name="name"]' },
        ],
      },
      {
        key: "camionetas_history",
        path: "/camionetas?tab=history",
        title: "Camionetas - Historial",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'a[href*="tab=history"]' },
          { label: "2", selector: ".vehicles-history-table" },
        ],
      },
      {
        key: "notifications",
        path: "/notifications",
        title: "Centro de notificaciones",
        fullPage: false,
        highlights: [
          { label: "1", selector: ".notification-list" },
          { label: "2", selector: 'form[action^="/notifications/"] button' },
        ],
      },
    ],
  },
  {
    key: "operator",
    identity: "operator",
    password: "operator123",
    steps: [
      {
        key: "login",
        path: "/login",
        title: "Inicio de sesion",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'input[name="identity"]' },
          { label: "2", selector: 'input[name="password"]' },
          { label: "3", selector: 'button[type="submit"]' },
        ],
      },
      {
        key: "dashboard",
        path: "/",
        title: "Panel principal",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'a[href="/entries"]' },
          { label: "2", selector: 'a[href="/entries/new"]' },
          { label: "3", selector: 'a[href="/camionetas"]' },
        ],
      },
      {
        key: "entries",
        path: "/entries",
        title: "Historial de ingresos",
        fullPage: false,
        highlights: [
          { label: "1", selector: "#entrySearch" },
          { label: "2", selector: 'select[name="entryStatus"]' },
          { label: "3", selector: 'input[name="sapCode"]' },
          { label: "4", selector: 'form[action*="/reprint"] button' },
        ],
      },
      {
        key: "camionetas_assignments",
        path: "/camionetas?tab=assignments",
        title: "Camionetas - Asignaciones",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'a[href*="tab=assignments"]' },
          { label: "2", selector: '[data-worker-search-input]' },
          { label: "3", selector: '.vehicle-inline-form button[type="submit"]' },
        ],
      },
      {
        key: "camionetas_manage",
        path: "/camionetas?tab=manage",
        title: "Camionetas - Mantencion",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'a[href*="tab=manage"]' },
          { label: "2", selector: 'form[action="/camionetas/create"] input[name="name"]' },
          { label: "3", selector: 'input[name="vehicleResetTime"]' },
        ],
      },
      {
        key: "camionetas_history",
        path: "/camionetas?tab=history",
        title: "Camionetas - Historial",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'a[href*="tab=history"]' },
          { label: "2", selector: ".vehicles-history-table" },
        ],
      },
    ],
  },
  {
    key: "user",
    identity: "user",
    password: "user123",
    steps: [
      {
        key: "login",
        path: "/login",
        title: "Inicio de sesion",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'input[name="identity"]' },
          { label: "2", selector: 'input[name="password"]' },
          { label: "3", selector: 'button[type="submit"]' },
        ],
      },
      {
        key: "dashboard",
        path: "/",
        title: "Panel principal",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'a[href="/entries/new"]' },
          { label: "2", selector: 'a[href="/entries"]' },
          { label: "3", selector: 'a[href="/camionetas"]' },
        ],
      },
      {
        key: "new_entry",
        path: "/entries/new",
        title: "Nuevo ingreso",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'input[name="businessName"]' },
          { label: "2", selector: 'textarea[name="clientReport"]' },
          { label: "3", selector: "#workerSearchField" },
          { label: "4", selector: "#openGalleryButton" },
          { label: "5", selector: 'button[type="submit"]' },
        ],
      },
      {
        key: "entries",
        path: "/entries",
        title: "Consulta de historial",
        fullPage: false,
        highlights: [
          { label: "1", selector: "#entrySearch" },
          { label: "2", selector: ".entries-table" },
        ],
      },
      {
        key: "camionetas_assignments",
        path: "/camionetas?tab=assignments",
        title: "Camionetas - Asignaciones",
        fullPage: false,
        highlights: [
          { label: "1", selector: 'a[href*="tab=assignments"]' },
          { label: "2", selector: '[data-worker-search-input]' },
          { label: "3", selector: '.vehicle-inline-form button[type="submit"]' },
        ],
      },
    ],
  },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function login(page, profile) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="identity"]', profile.identity);
  await page.fill('input[name="password"]', profile.password);
  await Promise.all([
    page.waitForURL(/localhost:3000\/$/),
    page.click('button[type="submit"]'),
  ]);
}

async function captureStep(page, profileKey, step) {
  await page.goto(`${baseUrl}${step.path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  const boxes = [];
  for (const highlight of step.highlights) {
    const locator = page.locator(highlight.selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }

    try {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (box) {
        boxes.push({
          label: highlight.label,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        });
      }
    } catch {
      // Ignore non-visible elements for this capture.
    }
  }

  const fileName = `${profileKey}_${step.key}.png`;
  const rawPath = path.join(rawDir, fileName);
  await page.screenshot({ path: rawPath, fullPage: false });

  return {
    profile: profileKey,
    key: step.key,
    title: step.title,
    path: rawPath,
    fileName,
    highlights: boxes,
  };
}

async function main() {
  await ensureDir(outputDir);
  await ensureDir(rawDir);

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const profile of profiles) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1200 },
      });
      const page = await context.newPage();
      await login(page, profile);

      for (const step of profile.steps) {
        const result = await captureStep(page, profile.key, step);
        results.push(result);
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  await fs.writeFile(metaPath, JSON.stringify(results, null, 2), "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
