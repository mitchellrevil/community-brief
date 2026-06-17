import { expect, test } from '@playwright/test';
import { storageStatePath } from './utils/config';

// Anonymous smoke checks: ensure protected routes redirect to /login.

test.describe('anonymous', () => {
  test.use({ storageState: storageStatePath('anon') });

  test('visiting a protected page redirects to login', async ({ page }) => {
    await page.goto('/simple-upload');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByText('Sign in to your account to continue')).toBeVisible();
  });
});
