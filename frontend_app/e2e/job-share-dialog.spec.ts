import { expect, test } from '@playwright/test';

import { ensureBusinessUnitAssigned } from './utils/onboarding';
import { e2eId } from './utils/ids';
import { frontendBaseURL, getCredentialsByRole, storageStatePath } from './utils/config';
import {
  createJobViaUpload,
  softDeleteJobApi,
  unshareJobApi,
} from './utils/jobs';

async function gotoSharedFiles(page: any) {
  await page.goto(`${frontendBaseURL}/audio-recordings/shared`, { waitUntil: 'domcontentloaded' });
  await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });
  await expect(page.getByRole('heading', { name: 'Shared files' })).toBeVisible({ timeout: 20_000 });
}

test.describe('Share dialog', () => {
  test('owner can share via UI dialog and recipient sees it in Shared files', async ({ browser }) => {
    test.setTimeout(240_000);

    const creds = await getCredentialsByRole();

    const ownerCtx = await browser.newContext({ storageState: storageStatePath('user') });
    const recipientCtx = await browser.newContext({ storageState: storageStatePath('editor') });

    const ownerPage = await ownerCtx.newPage();
    const recipientPage = await recipientCtx.newPage();

    const filename = `e2e-share-ui-${e2eId('job')}.txt`;
    const job = await createJobViaUpload(ownerPage.request, { filename });

    try {
      // Open details page as owner.
      await ownerPage.goto(`${frontendBaseURL}/audio-recordings/${job.id}`, { waitUntil: 'domcontentloaded' });
      await ensureBusinessUnitAssigned(ownerPage, { preferredName: 'Childrens Services' });

      // Open share dialog.
      await ownerPage.getByRole('button', { name: /Share Recording|Manage Sharing/ }).click();
      const dialog = ownerPage.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Share Recording' })).toBeVisible({ timeout: 15_000 });

      // Select user from search popover.
      await dialog.getByRole('combobox', { name: 'User' }).click();
      await dialog.getByPlaceholder('Search users by email or name...').fill(creds.editor.email);
      await dialog.getByText(creds.editor.email, { exact: true }).first().click({ timeout: 20_000 });

      // Choose permission level: Edit.
      await dialog.getByRole('combobox', { name: 'Permission Level' }).click();
      await expect(ownerPage.getByRole('listbox')).toBeVisible({ timeout: 10_000 });
      await ownerPage.getByRole('option', { name: /Edit/i }).click({ timeout: 20_000 });

      // Add a message.
      await dialog.getByPlaceholder('Add a message for the recipient...').fill('E2E share via UI');

      // Share.
      const shareReq = ownerPage.waitForResponse((res) => res.request().method() === 'POST' && /\/api\/v1\/jobs\/.+\/share/.test(res.url()) && res.ok(), { timeout: 30_000 });
      await dialog.getByRole('button', { name: /^Share$/ }).click();
      await shareReq;

      // Recipient sees the job in Shared files.
      await gotoSharedFiles(recipientPage);
      await expect(recipientPage.getByText(filename).first()).toBeVisible({ timeout: 30_000 });
      await expect(recipientPage.getByText('Editor').first()).toBeVisible({ timeout: 30_000 });

      // Recipient can open it.
      const sharedCard = recipientPage.getByText(filename).first().locator('xpath=ancestor::div[contains(@class,"group")][1]');
      await sharedCard.getByRole('link', { name: /Open/i }).click();
      await expect(recipientPage).toHaveURL(new RegExp(`/audio-recordings/${job.id}`));
      await expect(recipientPage.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 20_000 });
    } finally {
      // Cleanup via API (best-effort).
      await unshareJobApi(ownerPage.request, job.id, creds.editor.email).catch(() => {});
      await softDeleteJobApi(ownerPage.request, job.id).catch(() => {});

      await ownerCtx.close();
      await recipientCtx.close();
    }
  });
});
