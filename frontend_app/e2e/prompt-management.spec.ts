import {  expect, test } from '@playwright/test';

import { backendApiV1Url, frontendBaseURL, storageStatePath } from './utils/config';
import { ensureBusinessUnitAssigned } from './utils/onboarding';
import { e2eName } from './utils/ids';
import { deleteFolderFromMenu, deletePromptFromTree, findFolderRow, openFolderMenu } from './utils/prompt-tree';
import type {Response} from '@playwright/test';

const PREFERRED_BU = 'Childrens Services';

async function waitForCategoryByName(page: any, name: string) {
  const url = backendApiV1Url('/prompts/categories?limit=100&offset=0');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await page.request.get(url);
      if (res.ok()) {
        const json = await res.json();
        const cats = Array.isArray(json?.categories) ? json.categories : [];
        if (cats.some((c: any) => c?.name === name)) return;
      }
    } catch {}
    await page.waitForTimeout(1000);
  }
  throw new Error(`Timed out waiting for category to exist: ${name}`);
}

async function waitForSubcategoryByName(page: any, name: string) {
  const url = backendApiV1Url('/prompts/subcategories?limit=100&offset=0');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await page.request.get(url);
      if (res.ok()) {
        const json = await res.json();
        const subs = Array.isArray(json?.subcategories) ? json.subcategories : [];
        if (subs.some((s: any) => (s?.name ?? s?.subcategory_name) === name)) return;
      }
    } catch {}
    await page.waitForTimeout(1000);
  }
  throw new Error(`Timed out waiting for subcategory to exist: ${name}`);
}

async function selectPromptWithRetry(page: any, folderName: string, promptName: string) {
  const err = page.getByText(/Network request failed\./i);
  const promptHeading = page.getByRole('heading', { name: promptName }).first();

  for (let attempt = 0; attempt < 6; attempt++) {
    // If the sidebar is in an error state, reload and wait for backend/UI recovery.
    if ((await err.count().catch(() => 0)) > 0) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });
      await waitForPromptManagementReady(page);
    }

    await page.getByPlaceholder('Search prompts...').fill(folderName);

    // Expand folder to ensure child prompts are visible.
    try {
      const folderRow = await findFolderRow(page, folderName);
      await folderRow
        .getByRole('button', { name: /Expand|Collapse/ })
        .first()
        .click({ force: true })
        .catch(() => {});
    } catch {
      // ignore and retry
    }

    const promptItem = page.getByRole('treeitem').filter({ hasText: promptName }).first();
    if ((await promptItem.count().catch(() => 0)) > 0) {
      // Click the visible label, not the wrapper, to reliably hit the onClick target.
      await promptItem.getByText(promptName).first().click({ force: true });
      try {
        await expect(promptHeading).toBeVisible({ timeout: 7_500 });
        return;
      } catch {
        // Selection didn't stick; retry.
      }
    }

    await page.waitForTimeout(1000 + attempt * 250);
  }

  throw new Error(`Prompt not selectable after retries: ${promptName}`);
}

async function createSubfolderUnderAnyFolder(page: any, subfolderName: string): Promise<{ id: string } | null> {
  const sidebar = page.getByRole('complementary');
  const toggles = sidebar.getByRole('button', { name: /Expand|Collapse/ });
  const count = await toggles.count();

  for (let i = 0; i < Math.min(count, 20); i++) {
    const toggle = toggles.nth(i);
    const row = toggle.locator('xpath=ancestor::div[contains(@class,"group")][1]');
    const menuBtn = row.locator('button[aria-haspopup="menu"]').first();

    // Some folders may not expose editor actions; try until we find one that does.
    await row.hover().catch(() => {});
    await menuBtn.click({ force: true }).catch(() => {});

    const item = page.getByRole('menuitem', { name: 'New Subfolder' });
    if (await item.count().catch(() => 0)) {
      await item.click();
      await expect(page.getByRole('heading', { name: 'New Folder' })).toBeVisible({ timeout: 15_000 });
      await page.getByPlaceholder('Enter name...').fill(subfolderName);
      const createResp = page.waitForResponse(
        (res: Response) => res.request().method() === 'POST' && res.ok() && /\/prompts\/categories/.test(res.url()),
        { timeout: 30_000 },
      );
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByRole('heading', { name: 'New Folder' })).toHaveCount(0);
      const created = await (await createResp).json().catch(() => null);
      return created && typeof (created).id === 'string' ? (created) : null;
    }

    // Close menu and try next.
    await page.keyboard.press('Escape').catch(() => {});
  }

  throw new Error('Could not find any folder with a New Subfolder action');
}

async function waitForPromptManagementReady(page: any) {
  // Prompt Management depends on backend APIs. With uvicorn --reload, the backend can
  // restart during the suite and the UI will briefly show "Network request failed.".
  // First, poll the backend prompts API via authenticated request context.
  const apiUrl = backendApiV1Url('/prompts/categories?limit=1&offset=0');
  const apiDeadline = Date.now() + 60_000;
   
  for (;;) {
    try {
      const res = await page.request.get(apiUrl);
      if (res.ok()) break;
    } catch {
      // ignore and retry
    }
    if (Date.now() > apiDeadline) {
      throw new Error(`Prompt categories API not ready: GET ${apiUrl}`);
    }
    await page.waitForTimeout(1500);
  }

  // Then ensure the UI has recovered and rendered the tree.
  const err = page.getByText(/Network request failed\./i);
  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(page.getByPlaceholder('Search prompts...')).toBeVisible({ timeout: 20_000 });

    const hasErr = (await err.count().catch(() => 0)) > 0;
    const hasTree = await page.getByRole('tree').isVisible().catch(() => false);
    if (!hasErr && hasTree) return;

    await page.waitForTimeout(1000 + attempt * 500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });
  }

  await expect(err).toHaveCount(0, { timeout: 20_000 });
}

test.describe('prompt management', () => {
  test.describe('user permissions', () => {
    test.use({ storageState: storageStatePath('user') });

    test('user can browse but cannot edit or create', async ({ page }) => {
      await page.goto('/prompt-management');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });

      await expect(page.getByRole('heading', { name: 'Prompt Management' })).toBeVisible({ timeout: 20_000 });

      // Only admins can create root folders.
      await expect(page.getByTitle('New folder')).toHaveCount(0);

      // If prompts exist, selecting one should not show the Edit button for USER.
      const anyPrompt = page.getByRole('treeitem').first();
      if (await anyPrompt.count()) {
        await anyPrompt.click();
        await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
      }
    });
  });

  test.describe('admin CRUD + isolation', () => {
    test.use({ storageState: storageStatePath('admin') });

    test('admin can create/edit prompt with pre-session fields and then delete', async ({ page }) => {
      test.setTimeout(120_000);

      const folderName = e2eName('Subfolder');
      const promptName = e2eName('Prompt');
      const content = `# ${promptName}\n\nE2E prompt content ${Date.now()}`;

      let createdFolder = false;
      let createdPrompt = false;
      let createdFolderId: string | null = null;
      let createdPromptId: string | null = null;

      await page.goto('/prompt-management');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });

      await expect(page.getByRole('heading', { name: 'Prompt Management' })).toBeVisible({ timeout: 20_000 });
      await waitForPromptManagementReady(page);

      try {
        // Create a subfolder under the first folder that offers the action.
        await page.getByPlaceholder('Search prompts...').fill('');
        const createdFolderResp = await createSubfolderUnderAnyFolder(page, folderName);
        createdFolder = true;

        createdFolderId = createdFolderResp?.id || null;

        await waitForCategoryByName(page, folderName);

        // Narrow the sidebar tree to our new subfolder.
        await page.getByPlaceholder('Search prompts...').fill(folderName);
        await findFolderRow(page, folderName);

        // Create a prompt within the subfolder.
        await openFolderMenu(page, folderName);
        await page.getByRole('menuitem', { name: 'New Prompt' }).click();
        await expect(page.getByRole('heading', { name: 'New Prompt' })).toBeVisible();
        await page.getByPlaceholder('Enter name...').fill(promptName);
        const createPromptResp = page.waitForResponse(
          (res: Response) => res.request().method() === 'POST' && res.ok() && /\/prompts\/subcategories/.test(res.url()),
          { timeout: 30_000 },
        );
        await page.getByRole('button', { name: 'Create' }).click();
        createdPrompt = true;

        const createdPromptJson = await (await createPromptResp).json().catch(() => null);
        createdPromptId = createdPromptJson?.id || null;

        await waitForSubcategoryByName(page, promptName);

        // Select the prompt from the sidebar (with retries in case of backend reload/UI refresh races).
        await selectPromptWithRetry(page, folderName, promptName);
        await expect(page.getByRole('heading', { name: promptName })).toBeVisible({ timeout: 15_000 });

        // Edit prompt.
        await page.getByRole('button', { name: 'Edit' }).click();
        await expect(page.getByRole('heading', { name: 'Edit Prompt' })).toBeVisible({ timeout: 15_000 });

        // UIW MDEditor renders a textarea with this class.
        const mdInput = page.locator('textarea.w-md-editor-text-input');
        await expect(mdInput).toBeVisible({ timeout: 30_000 });
        await mdInput.click({ force: true });
        await page.keyboard.press('Control+A');
        await page.keyboard.type(content);

        // Add pre-session field.
        await page.getByRole('tab', { name: 'Form & Talking Points' }).click();
        await page.getByRole('button', { name: '+ Add Form Section' }).click();

        const fieldLabel = page.getByPlaceholder('What users will see').first();
        await expect(fieldLabel).toBeVisible({ timeout: 15_000 });
        await fieldLabel.fill('E2E Question');

        const updateResponse = page.waitForResponse(
          (res) => res.request().method() === 'PUT' && res.ok() && /\/subcategories\//.test(res.url()),
          { timeout: 30_000 },
        );

        await page.getByRole('button', { name: 'Save Changes' }).click();
        const updated = await (await updateResponse).json();

        // Backend should echo normalized talking points structure.
        expect(Array.isArray(updated?.preSessionTalkingPoints)).toBeTruthy();
        expect(updated.preSessionTalkingPoints.length).toBeGreaterThan(0);
        expect(updated.preSessionTalkingPoints[0]?.fields?.[0]?.label).toBe('E2E Question');

        // Also assert prompt content was saved.
        const promptsObj = updated?.prompts ?? {};
        expect(Object.values(promptsObj).join('\n')).toContain('E2E prompt content');

        // Back to browse view.
        await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible({ timeout: 15_000 });
      } finally {
        // Best-effort cleanup via backend API (more reliable than UI under reload/animation).
        try {
          if (createdPrompt && createdPromptId) {
            await page.request.delete(
              backendApiV1Url(`/prompts/subcategories/${encodeURIComponent(createdPromptId)}`),
            );
          }
        } catch {}

        try {
          if (createdFolder && createdFolderId) {
            await page.request.delete(
              backendApiV1Url(`/prompts/categories/${encodeURIComponent(createdFolderId)}`),
            );
          }
        } catch {}
      }

      // Best-effort: confirm removed from view.
      try {
        await page.getByPlaceholder('Search prompts...').fill(folderName);
        await expect(page.getByText('No results found')).toBeVisible({ timeout: 15_000 });
      } catch {}
    });

    test('editor cannot create root folder button', async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: storageStatePath('editor') });
      const page = await ctx.newPage();
      try {
        await page.goto(`${frontendBaseURL}/prompt-management`);
        await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });
        await expect(page.getByRole('heading', { name: 'Prompt Management' })).toBeVisible({ timeout: 20_000 });
        await waitForPromptManagementReady(page);
        await expect(page.getByTitle('New folder')).toHaveCount(0);
      } finally {
        await ctx.close();
      }
    });
  });
});
