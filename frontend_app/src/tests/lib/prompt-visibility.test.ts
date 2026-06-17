import { describe, expect, it } from 'vitest';
import {
  canAccessSubcategory,
  canUsePromptVisibility,
  normalizePromptVisibility,
} from '@/lib/prompt-visibility';
import { PermissionLevel } from '@/types/permissions';

describe('canAccessSubcategory', () => {
  it('allows access when visibility is "all" and no allowlist', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'all', visible_to_user_ids: null },
        PermissionLevel.USER,
        'user-1',
      ),
    ).toBe(true);
  });

  it('allows access when allowlist is empty (no restriction)', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'all', visible_to_user_ids: [] },
        PermissionLevel.USER,
        'user-1',
      ),
    ).toBe(true);
  });

  it('allows access when user is on the allowlist', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'all', visible_to_user_ids: ['user-1', 'user-2'] },
        PermissionLevel.USER,
        'user-1',
      ),
    ).toBe(true);
  });

  it('allows access when any current user identifier is on the allowlist', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'all', visible_to_user_ids: ['user@example.org'] },
        PermissionLevel.USER,
        ['user_1771620194780', 'User@example.org'],
      ),
    ).toBe(true);
  });

  it('denies access when user is NOT on the allowlist', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'all', visible_to_user_ids: ['user-2', 'user-3'] },
        PermissionLevel.USER,
        'user-1',
      ),
    ).toBe(false);
  });

  it('denies access when allowlist exists but userId is undefined', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'all', visible_to_user_ids: ['user-1'] },
        PermissionLevel.USER,
        undefined,
      ),
    ).toBe(false);
  });

  it('denies access when visibility is "nobody" even if on allowlist', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'nobody', visible_to_user_ids: ['user-1'] },
        PermissionLevel.USER,
        'user-1',
      ),
    ).toBe(false);
  });

  it('denies access when visibility is "only_editors" and user is not editor', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'only_editors', visible_to_user_ids: null },
        PermissionLevel.USER,
        'user-1',
      ),
    ).toBe(false);
  });

  it('allows editor access when visibility is "only_editors" and no allowlist', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'only_editors', visible_to_user_ids: null },
        PermissionLevel.EDITOR,
        'editor-1',
      ),
    ).toBe(true);
  });

  it('allows allowlisted user access when visibility is "only_editors"', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'only_editors', visible_to_user_ids: ['user-1'] },
        PermissionLevel.USER,
        'user-1',
      ),
    ).toBe(true);
  });

  it('denies editor access when visibility is "only_editors" but not on allowlist', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'only_editors', visible_to_user_ids: ['other-editor'] },
        PermissionLevel.EDITOR,
        'editor-1',
      ),
    ).toBe(false);
  });

  it('allows access when visible_to_user_ids is undefined (not set)', () => {
    expect(
      canAccessSubcategory(
        { prompt_visibility: 'all' },
        PermissionLevel.USER,
        'user-1',
      ),
    ).toBe(true);
  });
});

describe('canUsePromptVisibility', () => {
  it('returns true for "all" visibility regardless of permission', () => {
    expect(canUsePromptVisibility('all', PermissionLevel.USER)).toBe(true);
    expect(canUsePromptVisibility('all', undefined)).toBe(true);
  });

  it('returns false for "nobody" regardless of permission', () => {
    expect(canUsePromptVisibility('nobody', PermissionLevel.ADMIN)).toBe(false);
  });

  it('returns true for "only_editors" when user is editor', () => {
    expect(canUsePromptVisibility('only_editors', PermissionLevel.EDITOR)).toBe(true);
  });

  it('returns false for "only_editors" when user is regular user', () => {
    expect(canUsePromptVisibility('only_editors', PermissionLevel.USER)).toBe(false);
  });
});

describe('normalizePromptVisibility', () => {
  it('accepts current visibility values', () => {
    expect(normalizePromptVisibility('all')).toBe('all');
    expect(normalizePromptVisibility('only_editors')).toBe('only_editors');
    expect(normalizePromptVisibility('nobody')).toBe('nobody');
  });

  it('defaults to "all" for missing values', () => {
    expect(normalizePromptVisibility(null)).toBe('all');
    expect(normalizePromptVisibility(undefined)).toBe('all');
    expect(normalizePromptVisibility('')).toBe('all');
  });

  it('rejects old aliases and unknown values', () => {
    expect(() => normalizePromptVisibility('editors_only')).toThrow(/Invalid prompt_visibility/);
    expect(() => normalizePromptVisibility('only editors')).toThrow(/Invalid prompt_visibility/);
    expect(() => normalizePromptVisibility('none')).toThrow(/Invalid prompt_visibility/);
    expect(() => normalizePromptVisibility('archive')).toThrow(/Invalid prompt_visibility/);
    expect(() => normalizePromptVisibility('archived')).toThrow(/Invalid prompt_visibility/);
    expect(() => normalizePromptVisibility('random')).toThrow(/Invalid prompt_visibility/);
  });
});
