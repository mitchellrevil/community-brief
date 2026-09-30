import { expect, test } from "@playwright/test";

test("draft replacement commits atomically and rolls back failed writes", async ({ page }) => {
  await page.route("**/__storage-test", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>Draft storage test</body></html>" }));
  await page.goto("/__storage-test");
  const result = await page.evaluate(async () => {
    const moduleUrl = "/src/lib/draft-storage.ts";
    const { saveDraftRecording, getDraftRecording } = await import(moduleUrl);
    const draft = { categoryId: "category", subcategoryId: "template", categoryName: "Category", subcategoryName: "Template", audioBlob: new Blob(["original"], { type: "audio/mp4" }), duration: 10 };
    await saveDraftRecording(draft);
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = originalPut.apply(this, args);
      this.transaction.abort();
      return request;
    };
    let rejected = false;
    try { await saveDraftRecording({ ...draft, audioBlob: new Blob(["replacement"]), duration: 20 }); }
    catch { rejected = true; }
    finally { IDBObjectStore.prototype.put = originalPut; }
    const recovered = await getDraftRecording("category", "template");
    await Promise.all([
      saveDraftRecording({ ...draft, duration: 30 }),
      saveDraftRecording({ ...draft, duration: 40, continuationBlob: new Blob(["continued"], { type: "audio/mp4" }) }),
    ]);
    const latest = await getDraftRecording("category", "template");
    return { rejected, recovered: await recovered.audioBlob.text(), duration: recovered.duration, latest: latest.duration, continuation: await latest.continuationBlob.text() };
  });
  expect(result).toEqual({ rejected: true, recovered: "original", duration: 10, latest: 40, continuation: "continued" });
});
