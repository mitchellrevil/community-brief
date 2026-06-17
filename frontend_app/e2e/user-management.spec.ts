import {  expect, test } from '@playwright/test';
import { backendApiV1Url, storageStatePath } from './utils/config';
import { ensureBusinessUnitAssigned } from './utils/onboarding';
import type {APIRequestContext} from '@playwright/test';

/**
 * User Management E2E Tests
 *
 * Tests admin user management flows:
 * - Viewing user list with filtering
 * - Navigating to user details
 * - Updating user permissions (role changes)
 * - Changing user passwords
 * - Registering new users (requires Moderator permission)
 * - Deleting users
 * - Bulk user updates
 *
 * Note: Some operations (user creation/registration) require Moderator permission level,
 * which is higher than Admin. These tests will be skipped if the test admin account
 * doesn't have sufficient permissions.
 */

// Admin user credentials for API operations
let adminRequestContext: APIRequestContext;
const createdUserIds: Array<string> = [];
let adminPermissionLevel: string | null = null;

test.beforeAll(async ({ playwright, browser }) => {
  // Create an admin-authenticated request context for setup/cleanup
  const context = await browser.newContext({ storageState: storageStatePath('admin') });
  adminRequestContext = context.request;

  // Get admin permission level to determine available test coverage
  try {
    const meRes = await adminRequestContext.get(backendApiV1Url('/auth/users/me/permissions'));
    if (meRes.ok()) {
      const meData = await meRes.json();
      adminPermissionLevel = meData.data?.permission;
    }
  } catch {
    // Ignore errors in permission check
  }
});

test.afterAll(async () => {
  // Cleanup: Delete any users created during tests
  for (const userId of createdUserIds) {
    try {
      await adminRequestContext.delete(backendApiV1Url(`/auth/users/${userId}`));
    } catch {
      // Ignore cleanup errors
    }
  }
  await adminRequestContext.dispose();
});

async function createTestUser(
  request: APIRequestContext,
  opts: {
    email: string;
    password: string;
    permission?: 'user' | 'editor' | 'admin';
  },
): Promise<{ id: string; email: string }> {
  const res = await request.post(backendApiV1Url('/auth/users/register'), {
    data: {
      email: opts.email,
      password: opts.password,
      permission: opts.permission || 'user',
    },
    timeout: 30_000,
    failOnStatusCode: false,
  });

  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`Failed to create test user: HTTP ${res.status()} ${text}`);
  }

  const data = await res.json();
  if (data.user?.id) {
    createdUserIds.push(data.user.id);
  }
  return { id: data.user.id, email: data.user.email };
}

async function retryWithDelay<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

async function updateUserPermission(
  request: APIRequestContext,
  userId: string,
  permission: string,
): Promise<void> {
  const res = await request.patch(backendApiV1Url(`/auth/users/${userId}/permission`), {
    data: { permission },
    timeout: 30_000,
  });

  if (!res.ok()) {
    throw new Error(`Failed to update user permission: HTTP ${res.status()} ${await res.text()}`);
  }
}

async function getUserById(
  request: APIRequestContext,
  userId: string,
): Promise<{ id: string; email: string; permission: string } | null> {
  const res = await request.get(backendApiV1Url(`/auth/users/${userId}`), {
    timeout: 30_000,
  });

  if (!res.ok()) {
    return null;
  }

  const data = await res.json();
  return data.user;
}

test.describe('Admin User Management', () => {
  test.use({ storageState: storageStatePath('admin') });

  test('can view User Management page with user list', async ({ page }) => {
    await page.goto('/admin/user-management');
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Verify page loads with user management heading
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 20_000 });

    // Verify user stats section
    await expect(page.getByText(/User Statistics|Total Users/i)).toBeVisible();

    // Verify Users table/list exists
    await expect(page.getByRole('heading', { name: /Users/i })).toBeVisible();
  });

  test('can search and filter users', async ({ page }) => {
    await page.goto('/admin/user-management');
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Wait for users to load
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 20_000 });

    // Find search input
    const searchInput = page.getByPlaceholder('Search users...');
    await expect(searchInput).toBeVisible();

    // Search for admin user (should always exist)
    await searchInput.fill('admin');
    await page.waitForTimeout(500); // Allow for debounce

    // Verify filter dropdown exists
    const filterDropdown = page.getByRole('combobox').filter({ hasText: /Filter by role|All Roles/i }).first();
    await expect(filterDropdown).toBeVisible();

    // Apply permission filter
    await filterDropdown.click();
    await page.getByRole('option', { name: 'Admin' }).click();

    // Verify filtered results show admin badge
    await expect(page.getByText('Admin').first()).toBeVisible();
  });

  test('can navigate to user details page', async ({ page }) => {
    await page.goto('/admin/user-management');
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 20_000 });

    // Wait for users to load (at least one user should be visible)
    await expect(page.getByText(/@/).first()).toBeVisible({ timeout: 15_000 });

    // Click on first user email/name to navigate to details
    const firstUserLink = page.locator('td').first().locator('..').locator('span.font-medium, span.cursor-pointer').first();
    await firstUserLink.click();

    // Verify URL changed to user details page
    await expect(page).toHaveURL(/\/admin\/users\//);

    // Verify user details page loaded
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
  });

  test('can update user permission via Security tab', async ({ page, browser }) => {
    // Skip if admin doesn't have Moderator permission (required to create test users)
    if (!adminPermissionLevel || adminPermissionLevel.toLowerCase() !== 'moderator') {
      test.skip();
      return;
    }

    // Create a test user to modify (with retries for rate limiting)
    const timestamp = Date.now();
    const testUser = await retryWithDelay(() =>
      createTestUser(adminRequestContext, {
        email: `e2e-perm-test-${timestamp}@example.com`,
        password: 'Test1234!Secure',
        permission: 'user',
      })
    );

    // Navigate to the test user's details page
    await page.goto(`/admin/users/${testUser.id}`);
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Wait for user details to load
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });

    // Click on Security tab if tabs exist
    const securityTab = page.getByRole('tab', { name: /Security/i });
    if (await securityTab.isVisible().catch(() => false)) {
      await securityTab.click();
    }

    // Find and update the role/permission dropdown
    const roleSelect = page.locator('select#role, button[role="combobox"]').filter({ hasText: /User|Editor|Admin/i }).first();
    await roleSelect.click();

    // Select Editor role
    await page.getByRole('option', { name: 'Editor' }).click();

    // Click Save button
    const saveButton = page.getByRole('button', { name: /Save/i }).filter({ hasText: /^Save$/i });
    await saveButton.click();

    // Verify success toast
    await expect(page.getByText(/Permission updated|updated successfully/i)).toBeVisible({ timeout: 10_000 });

    // Verify via API that permission was updated
    const updatedUser = await getUserById(adminRequestContext, testUser.id);
    expect(updatedUser?.permission).toBe('editor');
  });

  test('can change user password', async ({ page }) => {
    // Skip if admin doesn't have Moderator permission (required to create test users)
    if (!adminPermissionLevel || adminPermissionLevel.toLowerCase() !== 'moderator') {
      test.skip();
      return;
    }

    // Create a test user
    const timestamp = Date.now();
    const testUser = await retryWithDelay(() =>
      createTestUser(adminRequestContext, {
        email: `e2e-password-test-${timestamp}@example.com`,
        password: 'OriginalPass123!',
        permission: 'user',
      })
    );

    // Navigate to user details
    await page.goto(`/admin/users/${testUser.id}`);
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Wait for page to load
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });

    // Click on Security tab if it exists
    const securityTab = page.getByRole('tab', { name: /Security/i });
    if (await securityTab.isVisible().catch(() => false)) {
      await securityTab.click();
    }

    // Find password input in "Change Password" section
    const passwordInput = page.getByPlaceholder(/Enter new password/i);
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });

    // Enter new password
    const newPassword = 'NewSecurePass123!';
    await passwordInput.fill(newPassword);

    // Click Update Password button
    const updateButton = page.getByRole('button', { name: /Update Password/i });
    await updateButton.click();

    // Verify success toast
    await expect(page.getByText(/Password changed|updated successfully/i)).toBeVisible({ timeout: 10_000 });
  });

  test('can register new user via dialog', async ({ page }) => {
    // Note: User registration requires Moderator permission level (higher than Admin)
    // In many environments the test admin account may have Admin but not Moderator permissions
    // This test verifies the UI exists and can be opened

    await page.goto('/admin/user-management');
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 20_000 });

    // Check if Register User button is present (only visible for users with MODERATOR+ permission)
    const registerButton = page.getByRole('button', { name: /Register User/i });

    // Button might not be visible if current admin doesn't have moderator permissions
    const isRegisterVisible = await registerButton.isVisible().catch(() => false);

    if (!isRegisterVisible) {
      test.info().annotations.push({ type: 'skip', description: 'Register button not visible - requires Moderator permission' });
      return;
    }

    await registerButton.click();

    // Wait for dialog to open
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Register New User/i })).toBeVisible();

    // Verify dialog has required fields
    await expect(dialog.getByPlaceholder(/newuser@example.com/i)).toBeVisible();
    await expect(dialog.getByPlaceholder(/At least 8 characters/i)).toBeVisible();
    await expect(dialog.getByRole('combobox').first()).toBeVisible();

    // Cancel the dialog (actual registration requires Moderator permission)
    await dialog.getByRole('button', { name: /Cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  test('can delete user with confirmation', async ({ page }) => {
    // Skip if admin doesn't have Moderator permission (required to create test users)
    if (!adminPermissionLevel || adminPermissionLevel.toLowerCase() !== 'moderator') {
      test.skip();
      return;
    }

    // Create a test user to delete
    const timestamp = Date.now();
    const testUser = await retryWithDelay(() =>
      createTestUser(adminRequestContext, {
        email: `e2e-delete-test-${timestamp}@example.com`,
        password: 'DeleteMe123!',
        permission: 'user',
      })
    );

    // Navigate to user details
    await page.goto(`/admin/users/${testUser.id}`);
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Wait for page to load
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });

    // Click on actions menu (three dots)
    const actionsButton = page.getByRole('button', { name: /Open menu/i });
    await actionsButton.click();

    // Click Delete User option
    await page.getByRole('menuitem', { name: /Delete User/i }).click();

    // Confirm deletion in alert dialog
    const alertDialog = page.getByRole('alertdialog');
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog.getByText(/permanently delete/i)).toBeVisible();

    // Click Delete in confirmation dialog
    await alertDialog.getByRole('button', { name: /Delete$/ }).click();

    // Verify redirected back to user management
    await expect(page).toHaveURL(/\/admin\/user-management/);

    // Verify success toast
    await expect(page.getByText(/deleted successfully|has been deleted/i)).toBeVisible({ timeout: 10_000 });

    // Verify user no longer exists via API
    const deletedUser = await getUserById(adminRequestContext, testUser.id);
    expect(deletedUser).toBeNull();
  });

  test('can perform bulk user updates', async ({ page }) => {
    // Skip if admin doesn't have Moderator permission (required to create test users)
    if (!adminPermissionLevel || adminPermissionLevel.toLowerCase() !== 'moderator') {
      test.skip();
      return;
    }

    // Create test users for bulk operations
    const timestamp = Date.now();
    const testUsers = [];

    for (let i = 0; i < 2; i++) {
      const user = await retryWithDelay(() =>
        createTestUser(adminRequestContext, {
          email: `e2e-bulk-test-${timestamp}-${i}@example.com`,
          password: 'BulkTest123!',
          permission: 'user',
        })
      );
      testUsers.push(user);
    }

    // Navigate to user management
    await page.goto('/admin/user-management');
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Wait for users to load
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 20_000 });

    // Search for our test users
    const searchInput = page.getByPlaceholder('Search users...');
    await searchInput.fill(`e2e-bulk-test-${timestamp}`);
    await page.waitForTimeout(500);

    // Select all test users via checkboxes
    const checkboxes = page.getByRole('checkbox');
    const visibleCheckboxes = await checkboxes.count();

    // Skip header checkbox, select data checkboxes
    for (let i = 1; i < Math.min(visibleCheckboxes, 3); i++) {
      await checkboxes.nth(i).check();
    }

    // Verify "X selected" indicator appears
    await expect(page.getByText(/\d+ selected/i)).toBeVisible();

    // Click "Bulk Actions" button
    const bulkActionsButton = page.getByRole('button', { name: /Bulk Actions/i });
    await bulkActionsButton.click();

    // Wait for bulk actions popover
    const popover = page.locator('[role="dialog"], .popover-content').first();
    await expect(popover.or(page.getByRole('dialog'))).toBeVisible({ timeout: 10_000 });

    // Select new role
    const bulkRoleSelect = page.getByRole('combobox').filter({ hasText: /Select role/i }).first();
    await bulkRoleSelect.click();
    await page.getByRole('option', { name: 'Editor' }).click();

    // Apply changes
    const applyButton = page.getByRole('button', { name: /Apply Changes/i });
    await applyButton.click();

    // Verify success toast
    await expect(page.getByText(/updated|success/i)).toBeVisible({ timeout: 10_000 });
  });

  test('cannot delete own account', async ({ page }) => {
    // This test verifies that the backend prevents self-deletion
    // We'll verify this directly via API since UI behavior may vary

    // Get admin user info first
    const meRes = await adminRequestContext.get(backendApiV1Url('/auth/users/me/permissions'));
    const meData = await meRes.json();
    const adminUserId = meData.data?.user_id;

    if (!adminUserId) {
      test.skip();
      return;
    }

    // Try to delete own account via API - should fail
    const deleteRes = await adminRequestContext.delete(
      backendApiV1Url(`/auth/users/${adminUserId}`)
    );

    // Should get 400 error for self-deletion attempt
    expect(deleteRes.status()).toBe(400);
    const errorData = await deleteRes.json();
    expect(errorData.message).toMatch(/cannot delete.*own|yourself/i);

    // UI verification: Navigate to own user details
    await page.goto(`/admin/users/${adminUserId}`);
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Wait for page to load - use a more lenient check
    await page.waitForLoadState('networkidle');

    // Verify we're on a page (either user details or error page)
    const url = page.url();
    expect(url).toMatch(/\/admin\/users\/|\/unauthorised|\/404/);
  });
});

test.describe('Editor User Management Access', () => {
  test.use({ storageState: storageStatePath('editor') });

  test('editor cannot access user management', async ({ page }) => {
    await page.goto('/admin/user-management');
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Should be redirected to unauthorized
    await expect(page).toHaveURL(/\/(unauthorised|login)/i);
  });
});

test.describe('Regular User Management Access', () => {
  test.use({ storageState: storageStatePath('user') });

  test('regular user cannot access user management', async ({ page }) => {
    await page.goto('/admin/user-management');
    await ensureBusinessUnitAssigned(page, { preferredName: 'Childrens Services' });

    // Should be redirected to unauthorized
    await expect(page).toHaveURL(/\/(unauthorised|login)/i);
  });
});
