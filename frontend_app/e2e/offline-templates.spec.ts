import { expect, test } from "@playwright/test";

test("prepares all pages and opens unvisited meeting types after an offline reload", async ({
  page,
  context,
}) => {
  await page.goto("/simple-upload");
  const syncStatus = page.getByRole("button", { name: "Templates synced" });
  await expect(syncStatus).toBeVisible({ timeout: 45000 });
  await syncStatus.hover();
  await expect(
    page.getByText("105 templates are available offline."),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Templates synced" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Offline service area/ }).click();
  await expect(
    page.getByText("Offline meeting 0", { exact: true }),
  ).toBeVisible();
  await page.getByText("Offline meeting 0", { exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /start recording/i }),
  ).toBeVisible();
});

test("does not expose saved templates to another account", async ({
  page,
  context,
}) => {
  await page.goto("/simple-upload");
  await expect(
    page.getByRole("button", { name: "Templates synced" }),
  ).toBeVisible({ timeout: 45000 });
  await context.setOffline(true);
  await page.evaluate(() => {
    const cached = JSON.parse(
      localStorage.getItem("community-offline-session-v1")!,
    );
    cached.user.user_id = "different-user";
    localStorage.setItem("community-offline-session-v1", JSON.stringify(cached));
  });
  await page.reload();
  const failedStatus = page.getByRole("button", {
    name: "Template sync failed",
  });
  await expect(failedStatus).toBeVisible();
  await failedStatus.hover();
  await expect(
    page.getByText(/Recording templates are not ready offline/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Offline service area/ }),
  ).toHaveCount(0);
});
