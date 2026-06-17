import { expect, test } from '@playwright/test';
import { storageStatePath } from './utils/config';
import { ensureBusinessUnitAssigned } from './utils/onboarding';

test.describe('user role', () => {
  test.use({ storageState: storageStatePath('user') });

  test('can access upload flow', async ({ page }) => {
    await page.goto('/simple-upload');
    await expect(page).toHaveURL(/\/simple-upload/);
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });
    await expect(page.getByRole('heading', { name: /New Recording/i })).toBeVisible({ timeout: 15_000 });
  });

  test('cannot access admin pages', async ({ page }) => {
    await page.goto('/admin/user-management');
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });
    await expect(page).toHaveURL(/\/unauthorised/);
    await expect(page.getByRole('heading', { name: 'Unauthorized' })).toBeVisible();
  });
});

test.describe('editor role', () => {
  test.use({ storageState: storageStatePath('editor') });

  test('can access upload flow', async ({ page }) => {
    await page.goto('/simple-upload');
    await expect(page).toHaveURL(/\/simple-upload/);
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });
    await expect(page.getByRole('heading', { name: /New Recording/i })).toBeVisible({ timeout: 15_000 });
  });

  test('cannot access admin pages', async ({ page }) => {
    await page.goto('/admin/user-management');
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });
    await expect(page).toHaveURL(/\/unauthorised/);
    await expect(page.getByRole('heading', { name: 'Unauthorized' })).toBeVisible();
  });
});

test.describe('admin role', () => {
  test.use({ storageState: storageStatePath('admin') });

  test('can access upload flow', async ({ page }) => {
    await page.goto('/simple-upload');
    await expect(page).toHaveURL(/\/simple-upload/);
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });
    await expect(page.getByRole('heading', { name: /New Recording/i })).toBeVisible({ timeout: 15_000 });
  });
});
