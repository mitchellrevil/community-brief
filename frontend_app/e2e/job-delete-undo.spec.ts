import { expect, test } from '@playwright/test';

import { ensureBusinessUnitAssigned } from './utils/onboarding';
import { e2eId } from './utils/ids';
import { backendApiV1Url, frontendBaseURL, storageStatePath } from './utils/config';
import { createJobViaUpload, softDeleteJobApi } from './utils/jobs';

async function gotoMyFiles(page: any) {
  await page.goto(`${frontendBaseURL}/audio-recordings`, { waitUntil: 'domcontentloaded' });
  await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });
  await expect(page.getByRole('heading', { name: 'My Files' })).toBeVisible({ timeout: 20_000 });
}

test.describe('Job delete and undo', () => {
  test.use({ storageState: storageStatePath('user') });

  test('user can delete a recording and undo restore it', async ({ page }) => {
    test.setTimeout(180_000);

    const filename = `e2e-delete-${e2eId('job')}.txt`;
    const job = await createJobViaUpload(page.request, { filename });

    try {
      await gotoMyFiles(page);

      // Filter down to the job.
      await page.getByLabel('Search recordings').fill(filename);

      const fileText = page.getByText(filename).first();
      await expect(fileText).toBeVisible({ timeout: 30_000 });

      // Open the card menu and delete.
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('menuitem', { name: /^Delete$/ }).click();

      // Confirm delete dialog.
      await expect(page.getByRole('heading', { name: 'Delete Recording' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Delete Recording' }).click();

      await expect(page.getByText(`${filename} deleted`)).toBeVisible({ timeout: 20_000 });

      // Validate the backend job record is marked deleted.
      const deletedRes = await page.request.get(backendApiV1Url(`/jobs/${job.id}`), { timeout: 30_000 });
      const deletedStatus = deletedRes.status();
      expect([200, 403, 404]).toContain(deletedStatus);
      if (deletedStatus === 200) {
        const deletedJson: any = await deletedRes.json();
        const deletedJob = deletedJson?.job ?? deletedJson;
        expect(Boolean(deletedJob?.is_deleted || deletedJob?.deleted_at)).toBeTruthy();
      }

      // Undo should restore the job.
      await page.getByRole('button', { name: 'Undo' }).click({ timeout: 20_000 });

      await expect(page.getByText(`${filename} restored`)).toBeVisible({ timeout: 20_000 });

      const restoredRes = await page.request.get(backendApiV1Url(`/jobs/${job.id}`), { timeout: 30_000 });
      expect(restoredRes.ok()).toBeTruthy();
      const restoredJson: any = await restoredRes.json();
      const restoredJob = restoredJson?.job ?? restoredJson;
      expect(Boolean(restoredJob?.is_deleted)).toBeFalsy();
    } finally {
      // Cleanup (best-effort). If undo didn't happen, the job may already be deleted.
      await softDeleteJobApi(page.request, job.id).catch(() => {});
    }
  });
});
