import {  expect } from '@playwright/test';
import type {Page} from '@playwright/test';

export interface EnsureBusinessUnitOptions {
  // Preferred BU label to pick when the dialog appears.
  preferredName?: string;
}

export async function ensureBusinessUnitAssigned(page: Page, opts: EnsureBusinessUnitOptions = {}) {
  const dialog = page.getByRole('dialog', { name: 'Select Business Units' });

  // The dialog can mount async after navigation.
  await dialog.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {});
  const visible = await dialog.isVisible().catch(() => false);
  if (!visible) return;

  const preferred = opts.preferredName?.trim();

  if (preferred) {
    const preferredCheckbox = dialog.getByRole('checkbox', { name: preferred });
    if (await preferredCheckbox.count()) {
      await preferredCheckbox.first().check({ force: true });
    } else {
      await dialog.getByRole('checkbox').first().check({ force: true });
    }
  } else {
    await dialog.getByRole('checkbox').first().check({ force: true });
  }

  const assign = dialog.getByRole('button', { name: /Assign Business Units/i });
  await expect(assign).toBeEnabled({ timeout: 10_000 });
  await assign.click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}
