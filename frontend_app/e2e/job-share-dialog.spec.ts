import { expect, test } from '@playwright/test';

import { ensureBusinessUnitAssigned } from './utils/onboarding';
import { e2eId } from './utils/ids';
import { frontendBaseURL, getCredentialsByRole, storageStatePath } from './utils/config';
import {
  createJobViaUpload,
  shareJobApi,
  softDeleteJobApi,
  unshareJobApi,
} from './utils/jobs';

test.describe('Manage access dialog', () => {
  test('owner can add, update, and remove access in one modal', async ({ browser }) => {
    test.setTimeout(240_000);

    const creds = await getCredentialsByRole();
    const ownerCtx = await browser.newContext({ storageState: storageStatePath('user') });
    const ownerPage = await ownerCtx.newPage();
    const filename = `e2e-manage-access-${e2eId('job')}.txt`;
    const job = await createJobViaUpload(ownerPage.request, { filename });

    try {
      await ownerPage.goto(`${frontendBaseURL}/audio-recordings/${job.id}`, { waitUntil: 'domcontentloaded' });
      await ensureBusinessUnitAssigned(ownerPage, { preferredName: 'Childrens Services' });

      await ownerPage.getByRole('button', { name: /Share Recording|Manage Sharing/ }).click();
      const dialog = ownerPage.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Manage Access' })).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole('combobox', { name: 'User' }).click();
      await dialog.getByPlaceholder('Search users by email or name...').fill(creds.editor.email);
      await dialog.getByText(creds.editor.email, { exact: true }).first().click({ timeout: 20_000 });

      await dialog.getByRole('combobox', { name: 'Permission' }).click();
      await ownerPage.getByRole('option', { name: /^Edit$/i }).click({ timeout: 20_000 });
      await dialog.getByPlaceholder('Add an optional message...').fill('E2E manage access');

      const addReq = ownerPage.waitForResponse((res) =>
        res.request().method() === 'POST' && /\/api\/v1\/jobs\/.+\/share/.test(res.url()) && res.ok(),
      );
      await dialog.getByRole('button', { name: 'Add access' }).click();
      await addReq;
      await expect(dialog.getByText(creds.editor.email, { exact: true })).toBeVisible({ timeout: 20_000 });

      const updateReq = ownerPage.waitForResponse((res) =>
        res.request().method() === 'POST' && /\/api\/v1\/jobs\/.+\/share/.test(res.url()) && res.ok(),
      );
      await dialog.getByRole('combobox', { name: `Permission for ${creds.editor.email}` }).click();
      await ownerPage.getByRole('option', { name: /^View/i }).click({ timeout: 20_000 });
      await updateReq;
      await expect(dialog.getByRole('combobox', { name: `Permission for ${creds.editor.email}` })).toContainText('View');

      const removeReq = ownerPage.waitForResponse((res) =>
        res.request().method() === 'DELETE' && /\/api\/v1\/jobs\/.+\/share\//.test(res.url()) && res.ok(),
      );
      await dialog.getByRole('button', { name: `Remove access for ${creds.editor.email}` }).click();
      await ownerPage.getByRole('alertdialog').getByRole('button', { name: 'Remove Access' }).click();
      await removeReq;
      await expect(dialog.getByText(creds.editor.email, { exact: true })).toHaveCount(0);
    } finally {
      await unshareJobApi(ownerPage.request, job.id, creds.editor.email).catch(() => {});
      await softDeleteJobApi(ownerPage.request, job.id).catch(() => {});
      await ownerCtx.close();
    }
  });

  test('shared admin can manage access from the job page', async ({ browser }) => {
    test.setTimeout(240_000);

    const creds = await getCredentialsByRole();
    const ownerCtx = await browser.newContext({ storageState: storageStatePath('user') });
    const managerCtx = await browser.newContext({ storageState: storageStatePath('editor') });
    const ownerPage = await ownerCtx.newPage();
    const managerPage = await managerCtx.newPage();
    const filename = `e2e-shared-admin-access-${e2eId('job')}.txt`;
    const job = await createJobViaUpload(ownerPage.request, { filename });

    try {
      await shareJobApi(ownerPage.request, job.id, {
        shared_user_email: creds.editor.email,
        permission_level: 'admin',
      });

      await managerPage.goto(`${frontendBaseURL}/audio-recordings/${job.id}`, { waitUntil: 'domcontentloaded' });
      await ensureBusinessUnitAssigned(managerPage, { preferredName: 'Childrens Services' });
      await managerPage.getByRole('button', { name: /Manage Sharing/ }).click();

      const dialog = managerPage.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Manage Access' })).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole('combobox', { name: 'User' }).click();
      await dialog.getByPlaceholder('Search users by email or name...').fill(creds.admin.email);
      await dialog.getByText(creds.admin.email, { exact: true }).first().click({ timeout: 20_000 });

      const addReq = managerPage.waitForResponse((res) =>
        res.request().method() === 'POST' && /\/api\/v1\/jobs\/.+\/share/.test(res.url()) && res.ok(),
      );
      await dialog.getByRole('button', { name: 'Add access' }).click();
      await addReq;
      await expect(dialog.getByText(creds.admin.email, { exact: true })).toBeVisible({ timeout: 20_000 });
    } finally {
      await unshareJobApi(ownerPage.request, job.id, creds.admin.email).catch(() => {});
      await unshareJobApi(ownerPage.request, job.id, creds.editor.email).catch(() => {});
      await softDeleteJobApi(ownerPage.request, job.id).catch(() => {});
      await ownerCtx.close();
      await managerCtx.close();
    }
  });
});
