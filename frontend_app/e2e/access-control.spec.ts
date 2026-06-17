import { expect, test } from '@playwright/test';

import { storageStatePath } from './utils/config';
import { ensureBusinessUnitAssigned } from './utils/onboarding';

const PREFERRED_BU = 'Childrens Services';

test.describe('access control', () => {
  test.describe('user', () => {
    test.use({ storageState: storageStatePath('user') });

    test('cannot access analytics dashboard', async ({ page }) => {
      await page.goto('/analytics');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });

      // Analytics page is not PermissionGuarded; access is enforced by API responses.
      // Depending on backend behavior, the app may redirect to /login (401) or /unauthorised (403).
      await page.waitForURL(/\/(login|unauthorised)/, { timeout: 15_000 });
      if (page.url().includes('/login')) {
        await expect(page.getByText('Welcome Back')).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Unauthorized' })).toBeVisible();
      }
    });

    test('cannot access admin pages', async ({ page }) => {
      await page.goto('/admin/user-management');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });
      await expect(page).toHaveURL(/\/unauthorised/);
      await expect(page.getByRole('heading', { name: 'Unauthorized' })).toBeVisible();

      await page.goto('/admin/deleted-jobs');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });
      await expect(page).toHaveURL(/\/unauthorised/);
      await expect(page.getByRole('heading', { name: 'Unauthorized' })).toBeVisible();
    });
  });

  test.describe('editor', () => {
    test.use({ storageState: storageStatePath('editor') });

    test('can access analytics dashboard', async ({ page }) => {
      await page.goto('/analytics');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });

      await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible({ timeout: 20_000 });

      // BU filter label varies by role and implementation.
      await expect(page.getByRole('combobox').first()).toBeVisible();
    });

    test('cannot access admin pages', async ({ page }) => {
      await page.goto('/admin/user-management');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });
      await expect(page).toHaveURL(/\/unauthorised/);
      await expect(page.getByRole('heading', { name: 'Unauthorized' })).toBeVisible();

      await page.goto('/admin/deleted-jobs');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });
      await expect(page).toHaveURL(/\/unauthorised/);
      await expect(page.getByRole('heading', { name: 'Unauthorized' })).toBeVisible();
    });
  });

  test.describe('admin', () => {
    test.use({ storageState: storageStatePath('admin') });

    test('can access analytics dashboard', async ({ page }) => {
      await page.goto('/analytics');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });

      await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible({ timeout: 20_000 });

      // Sanity check: key dashboard action exists.
      await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    });

    test('can access admin pages', async ({ page }) => {
      await page.goto('/admin/user-management');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });
      await expect(page).toHaveURL(/\/admin\/user-management/);
      await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 20_000 });

      await page.goto('/admin/deleted-jobs');
      await ensureBusinessUnitAssigned(page, { preferredName: PREFERRED_BU });
      await expect(page).toHaveURL(/\/admin\/deleted-jobs/);
    });
  });
});
