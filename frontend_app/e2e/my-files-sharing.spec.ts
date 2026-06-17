import { expect, test } from '@playwright/test';

import { ensureBusinessUnitAssigned } from './utils/onboarding';
import { e2eId } from './utils/ids';
import { apiV1Path, frontendBaseURL, getCredentialsByRole, storageStatePath } from './utils/config';
import {
  createJobViaUpload,
  patchJobDisplayNameApi,
  shareJobApi,
  softDeleteJobApi,
  unshareJobApi,
} from './utils/jobs';

async function patchDisplayNameWithRetry(pageRequest: any, jobId: string, displayname: string) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await patchJobDisplayNameApi(pageRequest, jobId, displayname);
    lastStatus = res.status();
    if (lastStatus !== 429) return res;
    // IP rate limiting in SecurityMiddleware uses a 60s window; back off briefly and retry.
    await new Promise((r) => setTimeout(r, 1500 + attempt * 500));
  }
  throw new Error(`PATCH ${apiV1Path(`/jobs/${jobId}`)} rate-limited (HTTP 429) after retries; lastStatus=${lastStatus}`);
}

async function gotoMyFiles(page: any) {
  await page.goto(`${frontendBaseURL}/audio-recordings`, { waitUntil: 'domcontentloaded' });
  await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });
  await expect(page.getByRole('heading', { name: 'My Files' })).toBeVisible({ timeout: 20_000 });
}

async function gotoSharedFiles(page: any) {
  await page.goto(`${frontendBaseURL}/audio-recordings/shared`, { waitUntil: 'domcontentloaded' });
  await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });
  await expect(page.getByRole('heading', { name: 'Shared files' })).toBeVisible({ timeout: 20_000 });
}

test.describe('My Files and sharing', () => {
  test('shared jobs can be accessed and edited based on permission level', async ({ browser }) => {
    test.setTimeout(180_000);

    const creds = await getCredentialsByRole();

    const ownerCtx = await browser.newContext({ storageState: storageStatePath('user') });
    const editorCtx = await browser.newContext({ storageState: storageStatePath('editor') });

    const ownerPage = await ownerCtx.newPage();
    const editorPage = await editorCtx.newPage();

    const filename = `e2e-myfiles-${e2eId('job')}.txt`;

    let jobId: string | null = null;

    try {
      // Create an isolated job as USER via backend API (legacy multipart upload).
      const job = await createJobViaUpload(ownerPage.request, { filename });
      jobId = job.id;

      // Share as view to the editor user.
      await shareJobApi(ownerPage.request, jobId, {
        shared_user_email: creds.editor.email,
        permission_level: 'view',
        message: 'E2E share (view)',
      });

      // Owner sees it in My Files.
      await gotoMyFiles(ownerPage);
      await ownerPage.getByLabel('Search recordings').fill(filename);
      await expect(ownerPage.getByText(filename).first()).toBeVisible({ timeout: 20_000 });

      // Editor should not see it in My Files.
      await gotoMyFiles(editorPage);
      await editorPage.getByLabel('Search recordings').fill(filename);
      await expect(editorPage.getByRole('heading', { name: 'No recordings found' })).toBeVisible({ timeout: 20_000 });

      // Editor sees it in Shared files with Viewer badge.
      await gotoSharedFiles(editorPage);
      await expect(editorPage.getByText(filename).first()).toBeVisible({ timeout: 20_000 });
      await expect(editorPage.getByText('Viewer').first()).toBeVisible();

      // Editor can open the shared job details page.
      await editorPage.goto(`${frontendBaseURL}/audio-recordings/${jobId}`, { waitUntil: 'domcontentloaded' });
      await ensureBusinessUnitAssigned(editorPage, { preferredName: 'Childrens Services' });
      await expect(editorPage.getByRole('heading', { name: /Recording not found/i })).toHaveCount(0);
      await expect(editorPage.getByRole('button', { name: 'Logout' })).toBeVisible();

      // With view permission, editor should be blocked from editing job display name.
      const viewPatch = await patchDisplayNameWithRetry(editorPage.request, jobId, `E2E rename denied ${Date.now()}`);
      expect(viewPatch.status()).toBe(403);

      // Upgrade share permission to edit.
      await unshareJobApi(ownerPage.request, jobId, creds.editor.email);
      await shareJobApi(ownerPage.request, jobId, {
        shared_user_email: creds.editor.email,
        permission_level: 'edit',
        message: 'E2E share (edit)',
      });

      // Refresh editor shared page to pick up updated permission.
      await gotoSharedFiles(editorPage);
      await editorPage.reload({ waitUntil: 'domcontentloaded' });
      await expect(editorPage.getByText(filename).first()).toBeVisible({ timeout: 20_000 });
      await expect(editorPage.getByText('Editor').first()).toBeVisible();

      // With edit permission, editor can patch displayname.
      const newName = `E2E renamed by editor ${Date.now()}`;
      const editPatch = await patchDisplayNameWithRetry(editorPage.request, jobId, newName);
      expect(editPatch.ok()).toBeTruthy();

      // Owner should be able to see the updated name via My Files search.
      await gotoMyFiles(ownerPage);
      await ownerPage.getByLabel('Search recordings').fill(newName);
      await expect(ownerPage.getByText(newName).first()).toBeVisible({ timeout: 20_000 });
    } finally {
      // Cleanup via backend API (best effort).
      try {
        if (jobId) {
          await unshareJobApi(ownerPage.request, jobId, creds.editor.email).catch(() => {});
          await softDeleteJobApi(ownerPage.request, jobId).catch(() => {});
        }
      } catch {
        // ignore
      }

      await ownerCtx.close();
      await editorCtx.close();
    }
  });
});
