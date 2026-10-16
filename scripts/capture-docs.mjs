// Run from frontend_app: node ../scripts/capture-docs.mjs
// Start Vite separately on 127.0.0.1:3108. All API replies are fictional fixtures.
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../frontend_app/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const out = fileURLToPath(new URL("../docs/images/", import.meta.url));
await mkdir(out, { recursive: true });
const timestamp = Date.UTC(2026, 9, 15, 10);
const folders = [
  "Community Services",
  "Housing & Neighbourhoods",
  "People & Partnerships",
  "Strategy & Delivery",
].map((name, i) => ({
  id: `area-${i}`,
  name,
  parent_id: null,
  is_business_unit: true,
  business_unit_id: `area-${i}`,
  created_at: timestamp,
  updated_at: timestamp,
}));
const templates = [
  "Team meeting",
  "Project review",
  "Community consultation",
].map((name, i) => ({
  id: `template-${i}`,
  name,
  folder_id: "area-0",
  prompts: {
    summary: "Summarise the discussion, decisions and agreed actions.",
  },
  pre_session_talking_points: [],
  in_session_talking_points: [
    {
      fields: [
        {
          name: "Progress and priorities",
          type: "text",
          value:
            "What has moved forward since our last meeting? Agree the priorities for the week ahead.",
        },
        {
          name: "Decisions and next steps",
          type: "text",
          value:
            "Capture each decision, the action owner and the agreed completion date.",
        },
      ],
    },
  ],
  analysis_workflow: "standard",
  visibility: "all",
  speaker_identification_enabled: false,
  recording_disclaimer_enabled: false,
  created_at: timestamp,
  updated_at: timestamp,
}));
const user = {
  user_id: "demo-user",
  email: "alex@example.test",
  display_name: "Alex Morgan",
  permission: "Admin",
  business_unit_id: "area-0",
  business_unit_ids: folders.map((f) => f.id),
  business_unit_names: folders.map((f) => f.name),
  favourite_prompt_ids: ["template-0", "template-1"],
};
const jobs = [
  "Community partnership review",
  "Neighbourhood improvement workshop",
  "Weekly delivery catch-up",
  "Volunteer programme planning",
  "Community hub consultation",
  "Service improvement review",
].map((name, i) => ({
  id: `demo-${i}`,
  user_id: user.user_id,
  displayname: name,
  display_name: name,
  filename: `meeting-${i + 1}.mp3`,
  file_path: `/demo/meeting-${i + 1}.mp3`,
  status: "completed",
  transcription_file_path: null,
  analysis_file_path: null,
  prompt_category_id: "area-0",
  prompt_subcategory_id: "template-0",
  created_at: timestamp - i * 86400000,
  updated_at: timestamp - i * 86400000 + 600000,
  audio_duration_seconds: 1320 + i * 300,
  category_name: folders[0].name,
  subcategory_name: templates[0].name,
  type: "audio",
}));
const pageOf = (items) => ({
  items,
  total: items.length,
  limit: 100,
  offset: 0,
  has_more: false,
});
const browser = await chromium.launch({
  executablePath: process.env.DOCS_CHROMIUM_PATH || undefined,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  colorScheme: "light",
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
await context.addInitScript(() => {
  localStorage.setItem("community-install-guidance-dismissed", "true");
  localStorage.setItem("theme", "light");
});
const requests = [];
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
    return route.abort();
  if (!url.pathname.startsWith("/api/") && url.pathname !== "/health/ready")
    return route.continue();
  requests.push(url.pathname);
  let body = pageOf([]);
  if (url.pathname.endsWith("/auth/me")) body = user;
  else if (url.pathname === "/api/v1/announcements")
    body = { announcements: [], total: 0, unread_count: 0 };
  else if (url.pathname.endsWith("/permissions"))
    body = {
      ...user,
      can_upload: true,
      can_manage_prompts: true,
      can_view_analytics: true,
    };
  else if (url.pathname === "/api/v1/business-units") body = folders;
  else if (url.pathname === "/api/v1/folders") body = pageOf(folders);
  else if (url.pathname.startsWith("/api/v1/folders/"))
    body = folders.find((f) => url.pathname.endsWith(f.id));
  else if (url.pathname === "/api/v1/templates") body = pageOf(templates);
  else if (url.pathname.startsWith("/api/v1/templates/"))
    body = templates.find((t) => url.pathname.endsWith(t.id)) ?? pageOf([]);
  else if (url.pathname === "/api/v1/jobs")
    body = { jobs, count: jobs.length, status: 200 };
  else if (url.pathname.startsWith("/api/v1/jobs/demo-"))
    body = jobs.find((j) => url.pathname.endsWith(j.id)) ?? {};
  else if (url.pathname === "/health/ready") body = { status: "ok" };
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (error) => console.error("PAGE ERROR:", error.message));
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(650); // Let route transitions and responsive layout settle.
  if (await page.getByText("An error occurred", { exact: true }).count())
    throw new Error("Resolve the fixture error before publishing screenshots.");
  await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
}
await page.goto("http://127.0.0.1:3108/simple-upload");
await page
  .getByText("Select Directorate Area", { exact: true })
  .waitFor({ timeout: 60000 });
await page.getByText("Community Services", { exact: true }).first().waitFor();
await page
  .getByRole("button", { name: "Acknowledge retention policy" })
  .click();
await capture("01-choose-template");
await page.getByText("Team meeting", { exact: true }).first().click();
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page
  .getByRole("button", { name: /start recording/i })
  .first()
  .waitFor();
await capture("02-record-desktop");
await page.setViewportSize({ width: 390, height: 844 });
await capture("03-record-mobile");
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:3108/audio-recordings");
await page
  .getByText("Community partnership review", { exact: true })
  .first()
  .waitFor();
await capture("04-my-files");
// Frame the real captures as a documentation figure. The app pixels are unchanged.
const desktop = (await readFile(`${out}/04-my-files.png`)).toString("base64");
const mobile = (await readFile(`${out}/03-record-mobile.png`)).toString(
  "base64",
);
const showcase = await context.newPage();
await showcase.setViewportSize({ width: 1600, height: 930 });
await showcase.route("**/documentation-figure", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;width:1600px;height:930px;overflow:hidden;background:#f3f4f6}
.desktop{position:absolute;left:40px;top:40px;width:1224px;border:1px solid #d1d5db;border-radius:8px;overflow:hidden;background:white}
.mobile{position:absolute;right:40px;top:140px;width:280px;border:5px solid #374151;border-radius:26px;overflow:hidden;background:white}
img{display:block;width:100%}
</style></head><body><div class="desktop"><img alt="Desktop file library" src="data:image/png;base64,${desktop}"></div><div class="mobile"><img alt="Mobile recording" src="data:image/png;base64,${mobile}"></div></body></html>`,
  }),
);
await showcase.goto("http://127.0.0.1:3108/documentation-figure");
await showcase.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.decode()));
});
await showcase.screenshot({ path: `${out}/product-tour.png` });
await browser.close();
console.log(
  `Mocked ${new Set(requests).size} API routes; no cloud services used.`,
);
console.log(`Screenshots saved to ${out}`);
