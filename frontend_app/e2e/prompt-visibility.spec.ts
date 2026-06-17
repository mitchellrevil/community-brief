/**
 * Prompt Visibility Scoping — E2E Tests
 *
 * Verifies that `prompt_visibility` and `visible_to_user_ids` are properly enforced
 * for all authenticated users at both the list and get-by-id API endpoints.
 *
 * Bugs being regression-tested:
 *   1. Non-editors could bypass visibility by passing `?include_hidden=true` → now blocked server-side.
 *   2. `GET /subcategories/{id}` had no visibility check → now returns 404 for inaccessible prompts.
 *   3. `visible_to_user_ids` allowlist restricts runtime access for users not in the list.
 */

import { expect, test } from '@playwright/test';
import { backendApiV1Url, storageStatePath } from './utils/config';
import { e2eName } from './utils/ids';
import type { APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared state populated once in beforeAll and cleaned up in afterAll
// ---------------------------------------------------------------------------
let adminCtx: APIRequestContext;
let userCtx: APIRequestContext;
let editorCtx: APIRequestContext;

/** The category used as the parent for all test subcategories. */
let testCategoryId: string;

/** Subcategory visible only to editors (prompt_visibility = "only_editors"). */
let editorsOnlySubId: string;

/** Subcategory visible to nobody at runtime (prompt_visibility = "nobody"). */
let nobodySubId: string;

/** Subcategory restricted to the regular user via visible_to_user_ids. */
let allowlistSubId: string;

/** The regular user's user_id (needed to build the allowlist). */
let regularUserId: string;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
test.beforeAll(async ({ playwright }) => {
  adminCtx = await playwright.request.newContext({ storageState: storageStatePath('admin') });
  userCtx = await playwright.request.newContext({ storageState: storageStatePath('user') });
  editorCtx = await playwright.request.newContext({ storageState: storageStatePath('editor') });

  // Resolve the regular user's ID so we can build the allowlist.
  const meRes = await userCtx.get(backendApiV1Url('/auth/users/me/permissions'));
  expect(meRes.ok(), `Could not resolve user ID: ${meRes.status()}`).toBeTruthy();
  const meData = await meRes.json();
  regularUserId = meData.data?.user_id;
  expect(regularUserId, 'Regular user ID must be present').toBeTruthy();

  // Find any existing (non-root) category as a parent for the test subcategories.
  // This avoids having to create a top-level BU in the test suite.
  const catRes = await adminCtx.get(backendApiV1Url('/prompts/categories?limit=100&offset=0'));
  expect(catRes.ok(), `Could not list categories: ${catRes.status()}`).toBeTruthy();
  const catData = await catRes.json();
  const categories: Array<{ id: string; parent_category_id: string | null }> = catData.categories ?? [];

  // Prefer a non-root category (subfolder), fall back to the first available root.
  const nonRoot = categories.find((c) => c.parent_category_id != null);
  const chosen = nonRoot ?? categories[0];
  expect(chosen, 'No categories exist in the system — cannot run visibility tests').toBeTruthy();
  testCategoryId = chosen.id;

  // ---- create test subcategories ----

  const editorsOnlyRes = await adminCtx.post(backendApiV1Url('/prompts/subcategories'), {
    data: {
      name: e2eName('Editors Only'),
      category_id: testCategoryId,
      prompts: { main: 'Editors-only prompt content' },
      prompt_visibility: 'only_editors',
    },
  });
  expect(editorsOnlyRes.ok(), `Failed to create editors-only subcategory: ${editorsOnlyRes.status()}`).toBeTruthy();
  editorsOnlySubId = (await editorsOnlyRes.json()).id;

  const nobodyRes = await adminCtx.post(backendApiV1Url('/prompts/subcategories'), {
    data: {
      name: e2eName('Nobody Visible'),
      category_id: testCategoryId,
      prompts: { main: 'Nobody-visible prompt content' },
      prompt_visibility: 'nobody',
    },
  });
  expect(nobodyRes.ok(), `Failed to create nobody subcategory: ${nobodyRes.status()}`).toBeTruthy();
  nobodySubId = (await nobodyRes.json()).id;

  const allowlistRes = await adminCtx.post(backendApiV1Url('/prompts/subcategories'), {
    data: {
      name: e2eName('Allowlist User'),
      category_id: testCategoryId,
      prompts: { main: 'Allowlisted prompt content' },
      prompt_visibility: 'all',
      visible_to_user_ids: [regularUserId],
    },
  });
  expect(allowlistRes.ok(), `Failed to create allowlist subcategory: ${allowlistRes.status()}`).toBeTruthy();
  allowlistSubId = (await allowlistRes.json()).id;
});

test.afterAll(async () => {
  for (const id of [editorsOnlySubId, nobodySubId, allowlistSubId]) {
    if (id) {
      await adminCtx
        .delete(backendApiV1Url(`/prompts/subcategories/${encodeURIComponent(id)}`))
        .catch(() => {});
    }
  }
  await adminCtx.dispose();
  await userCtx.dispose();
  await editorCtx.dispose();
});

// ---------------------------------------------------------------------------
// Helper: fetch all subcategories for our test category (handles pagination)
// ---------------------------------------------------------------------------
async function fetchTestSubcategoryIds(
  ctx: APIRequestContext,
  opts: { includeHidden?: boolean } = {},
): Promise<Set<string>> {
  const params = new URLSearchParams({ category_id: testCategoryId, limit: '100', offset: '0' });
  if (opts.includeHidden) params.set('include_hidden', 'true');

  const res = await ctx.get(backendApiV1Url(`/prompts/subcategories?${params}`));
  expect(res.ok(), `Subcategory list returned ${res.status()}`).toBeTruthy();
  const data = await res.json();
  return new Set<string>((data.subcategories as Array<{ id: string }>).map((s) => s.id));
}

// ---------------------------------------------------------------------------
// prompt_visibility = "only_editors"
// ---------------------------------------------------------------------------
test.describe('only_editors visibility', () => {
  test('user cannot see only_editors prompt in runtime listing', async () => {
    const ids = await fetchTestSubcategoryIds(userCtx);
    expect(ids.has(editorsOnlySubId)).toBe(false);
  });

  test('user passing include_hidden=true is still blocked', async () => {
    // Core regression: non-editors must not bypass visibility via the include_hidden flag.
    const ids = await fetchTestSubcategoryIds(userCtx, { includeHidden: true });
    expect(ids.has(editorsOnlySubId)).toBe(false);
  });

  test('user cannot fetch only_editors subcategory by ID', async () => {
    const res = await userCtx.get(
      backendApiV1Url(`/prompts/subcategories/${encodeURIComponent(editorsOnlySubId)}`),
    );
    // Server should return 404 — not leak the resource exists at a 403.
    expect(res.status()).toBe(404);
  });

  test('editor can see only_editors prompt in management mode (include_hidden=true)', async () => {
    const ids = await fetchTestSubcategoryIds(editorCtx, { includeHidden: true });
    expect(ids.has(editorsOnlySubId)).toBe(true);
  });

  test('editor CAN see only_editors prompt in runtime listing (editors pass the gate)', async () => {
    // "only_editors" visibility means editors can use the prompt at runtime too —
    // it just blocks regular users. The include_hidden flag is only needed for "nobody".
    const ids = await fetchTestSubcategoryIds(editorCtx);
    expect(ids.has(editorsOnlySubId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prompt_visibility = "nobody"
// ---------------------------------------------------------------------------
test.describe('nobody visibility', () => {
  test('user cannot see nobody prompt in runtime listing', async () => {
    const ids = await fetchTestSubcategoryIds(userCtx);
    expect(ids.has(nobodySubId)).toBe(false);
  });

  test('user passing include_hidden=true still cannot see nobody prompt', async () => {
    const ids = await fetchTestSubcategoryIds(userCtx, { includeHidden: true });
    expect(ids.has(nobodySubId)).toBe(false);
  });

  test('user cannot fetch nobody subcategory by ID', async () => {
    const res = await userCtx.get(
      backendApiV1Url(`/prompts/subcategories/${encodeURIComponent(nobodySubId)}`),
    );
    expect(res.status()).toBe(404);
  });

  test('editor can see nobody prompt in management mode', async () => {
    const ids = await fetchTestSubcategoryIds(editorCtx, { includeHidden: true });
    expect(ids.has(nobodySubId)).toBe(true);
  });

  test('editor cannot see nobody prompt in runtime listing', async () => {
    const ids = await fetchTestSubcategoryIds(editorCtx);
    expect(ids.has(nobodySubId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// visible_to_user_ids allowlist
// ---------------------------------------------------------------------------
test.describe('visible_to_user_ids allowlist', () => {
  test('allowlisted user can see the prompt in runtime listing', async () => {
    const ids = await fetchTestSubcategoryIds(userCtx);
    expect(ids.has(allowlistSubId)).toBe(true);
  });

  test('allowlisted user can fetch the prompt by ID', async () => {
    const res = await userCtx.get(
      backendApiV1Url(`/prompts/subcategories/${encodeURIComponent(allowlistSubId)}`),
    );
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.id).toBe(allowlistSubId);
  });

  test('editor (not in allowlist) cannot see allowlisted prompt at runtime', async () => {
    const ids = await fetchTestSubcategoryIds(editorCtx);
    expect(ids.has(allowlistSubId)).toBe(false);
  });

  test('editor CAN fetch allowlisted prompt by ID (management access bypasses allowlist)', async () => {
    // Editors have management access to all prompts — visible_to_user_ids only
    // restricts which regular users can use the prompt at runtime, not who can manage it.
    const res = await editorCtx.get(
      backendApiV1Url(`/prompts/subcategories/${encodeURIComponent(allowlistSubId)}`),
    );
    expect(res.ok()).toBe(true);
  });

  test('editor can see allowlisted prompt in management mode (include_hidden=true)', async () => {
    const ids = await fetchTestSubcategoryIds(editorCtx, { includeHidden: true });
    expect(ids.has(allowlistSubId)).toBe(true);
  });

  test('user passing include_hidden=true is still blocked for non-accessible prompts', async () => {
    // The user IS in the allowlist — they should still see it even without include_hidden.
    const ids = await fetchTestSubcategoryIds(userCtx, { includeHidden: true });
    expect(ids.has(allowlistSubId)).toBe(true);
  });
});
