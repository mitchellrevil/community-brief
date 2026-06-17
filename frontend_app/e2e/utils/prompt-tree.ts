import {   expect } from '@playwright/test';
import type {Locator, Page} from '@playwright/test';

export async function findFolderRow(page: Page, folderName: string): Promise<Locator> {
  const sidebar = page.getByRole('complementary');
  await expect(sidebar).toBeVisible({ timeout: 20_000 });
  const label = sidebar.getByText(folderName, { exact: true });
  await expect(label).toBeVisible({ timeout: 15_000 });

  // Nearest clickable row container.
  return label.locator('xpath=ancestor::div[contains(@class,"group")][1]');
}

export async function openFolderMenu(page: Page, folderName: string): Promise<void> {
  const row = await findFolderRow(page, folderName);
  const menuBtn = row.locator('button[aria-haspopup="menu"]').first();
  await row.hover({ timeout: 5_000 }).catch(() => {});
  await menuBtn.scrollIntoViewIfNeeded();
  await menuBtn.click({ force: true });
}

export async function deleteFolderFromMenu(page: Page, folderName: string): Promise<void> {
  await openFolderMenu(page, folderName);
  await page.getByRole('menuitem', { name: /^Delete$/ }).click();
  await page.getByRole('button', { name: /^Delete$/ }).click();
}

export async function deletePromptFromTree(page: Page, promptName: string): Promise<void> {
  const treeItem = page.getByRole('treeitem').filter({ hasText: promptName }).first();
  await expect(treeItem).toBeVisible({ timeout: 15_000 });
  const menuBtn = treeItem.locator('button[aria-haspopup="menu"]').first();
  await treeItem.hover({ timeout: 5_000 }).catch(() => {});
  await menuBtn.scrollIntoViewIfNeeded();
  await menuBtn.click({ force: true });
  await page.getByRole('menuitem', { name: /^Delete$/ }).click();
  await page.getByRole('button', { name: /^Delete$/ }).click();
}
