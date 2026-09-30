/**
 * Tests for theme definitions in themes.ts
 * 
 * Ensures all themes:
 * - Have correct structure (id, label, description, preview, group)
 * - Exist in the expected exports
 * - Have consistent token surface
 * 
 * TDD: These tests are written first to define expected behavior.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import type {ThemeOption} from '@/lib/themes';
import {
  
  allThemeIds,
  customThemes,
  systemThemes,
  themeOptions
} from '@/lib/themes';

// Expected CSS custom properties that each theme must define in styles.css
// (This documents the theme token surface for consistency)
const THEME_TOKEN_KEYS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
] as const;

// Required keys for ThemeOption preview object
const PREVIEW_KEYS = ['from', 'to', 'accent'] as const;

// Required keys for ThemeOption object
const THEME_OPTION_KEYS = ['id', 'label', 'description', 'preview', 'group'] as const;

describe('Theme Definitions', () => {
  describe('Theme structure validation', () => {
    const allThemes = [...customThemes, ...systemThemes];

    test.each(allThemes)('theme "$id" has all required keys', (theme) => {
      THEME_OPTION_KEYS.forEach((key) => {
        expect(theme).toHaveProperty(key);
      });
    });

    test.each(allThemes)('theme "$id" has valid preview with from, to, accent', (theme) => {
      expect(theme.preview).toBeDefined();
      PREVIEW_KEYS.forEach((key) => {
        expect(theme.preview).toHaveProperty(key);
        expect(typeof theme.preview[key]).toBe('string');
        // Preview colors should be oklch format
        expect(theme.preview[key]).toMatch(/oklch\([^)]+\)/);
      });
    });

    test.each(allThemes)('theme "$id" has valid group', (theme) => {
      expect(['custom', 'system']).toContain(theme.group);
    });

    test.each(allThemes)('theme "$id" has non-empty label and description', (theme) => {
      expect(theme.label.length).toBeGreaterThan(0);
      expect(theme.description.length).toBeGreaterThan(0);
    });
  });

  describe('Expected themes exist', () => {
    // Core themes that must always exist
    const expectedCustomThemes = [
      'obsidian',
      'sunburst',
      'oceanic',
      'berry',
      'citrus',
      'ember',
      'graphite',
      // New themes to be added
      'studioMidnight',
      'editorialSlate',
    ];

    const expectedSystemThemes = ['light', 'dark', 'system'];

    test.each(expectedCustomThemes)('custom theme "%s" exists', (themeId) => {
      const theme = customThemes.find((t) => t.id === themeId);
      expect(theme).toBeDefined();
      expect(theme?.group).toBe('custom');
    });

    test.each(expectedSystemThemes)('system theme "%s" exists', (themeId) => {
      const theme = systemThemes.find((t) => t.id === themeId);
      expect(theme).toBeDefined();
      expect(theme?.group).toBe('system');
    });
  });

  describe('allThemeIds export', () => {
    test('includes all custom and system theme ids', () => {
      const expectedIds = [
        ...customThemes.map((t) => t.id),
        ...systemThemes.map((t) => t.id),
      ];
      expect(allThemeIds).toEqual(expectedIds);
    });

    test('has no duplicates', () => {
      const uniqueIds = new Set(allThemeIds);
      expect(uniqueIds.size).toBe(allThemeIds.length);
    });
  });

  describe('themeOptions export', () => {
    test('includes all themes', () => {
      expect(themeOptions.length).toBe(customThemes.length + systemThemes.length);
    });

    test('has custom themes first, then system themes', () => {
      const customCount = customThemes.length;
      themeOptions.slice(0, customCount).forEach((theme) => {
        expect(theme.group).toBe('custom');
      });
      themeOptions.slice(customCount).forEach((theme) => {
        expect(theme.group).toBe('system');
      });
    });
  });

  describe('Berry theme stability (must not change)', () => {
    // Berry theme values are locked - this test ensures they don't change
    let berryTheme: ThemeOption | undefined;

    beforeEach(() => {
      berryTheme = customThemes.find((t) => t.id === 'berry');
    });

    test('berry theme exists', () => {
      expect(berryTheme).toBeDefined();
    });

    test('berry theme has correct metadata', () => {
      expect(berryTheme?.id).toBe('berry');
      expect(berryTheme?.label).toBe('Berry');
      expect(berryTheme?.description).toBe('Vibrant pink and fuchsia tones.');
      expect(berryTheme?.group).toBe('custom');
    });

    test('berry theme preview colors are unchanged', () => {
      expect(berryTheme?.preview).toEqual({
        from: 'oklch(0.65 0.28 340)',
        to: 'oklch(0.75 0.25 320)',
        accent: 'oklch(0.7 0.24 300)',
      });
    });
  });

  describe('Citrus theme (redesigned as dark variant)', () => {
    let citrusTheme: ThemeOption | undefined;

    beforeEach(() => {
      citrusTheme = customThemes.find((t) => t.id === 'citrus');
    });

    test('citrus theme exists', () => {
      expect(citrusTheme).toBeDefined();
    });

    test('citrus theme is a dark-leaning theme with warm colors', () => {
      expect(citrusTheme).toBeDefined();
      // Preview "from" should be darker (lower L value in oklch)
      // A dark theme typically has L < 0.3 for backgrounds
      const fromMatch = citrusTheme?.preview.from.match(/oklch\(([0-9.]+)/);
      expect(fromMatch).not.toBeNull();
      const luminance = parseFloat(fromMatch![1]);
      expect(luminance).toBeLessThan(0.35); // Dark background
    });

    test('citrus theme has warm accent colors (orange/amber hue range)', () => {
      expect(citrusTheme).toBeDefined();
      // Orange/amber hues are typically in the 30-80 range in oklch
      const accentMatch = citrusTheme?.preview.accent.match(/oklch\([0-9.]+ [0-9.]+ ([0-9.]+)\)/);
      expect(accentMatch).not.toBeNull();
      const hue = parseFloat(accentMatch![1]);
      expect(hue).toBeGreaterThanOrEqual(20);
      expect(hue).toBeLessThanOrEqual(90);
    });
  });

  describe('Sunburst theme (redesigned)', () => {
    let sunburstTheme: ThemeOption | undefined;

    beforeEach(() => {
      sunburstTheme = customThemes.find((t) => t.id === 'sunburst');
    });

    test('sunburst theme exists', () => {
      expect(sunburstTheme).toBeDefined();
    });

    test('sunburst theme is bright and optimistic', () => {
      expect(sunburstTheme).toBeDefined();
      // Bright theme should have higher luminance in preview "from"
      const fromMatch = sunburstTheme?.preview.from.match(/oklch\(([0-9.]+)/);
      expect(fromMatch).not.toBeNull();
      const luminance = parseFloat(fromMatch![1]);
      expect(luminance).toBeGreaterThan(0.85); // Light/bright background
    });
  });

  describe('New theme: studioMidnight (calm, analytic)', () => {
    let studioMidnightTheme: ThemeOption | undefined;

    beforeEach(() => {
      studioMidnightTheme = customThemes.find((t) => t.id === 'studioMidnight');
    });

    test('studioMidnight theme exists', () => {
      expect(studioMidnightTheme).toBeDefined();
    });

    test('studioMidnight is a dark theme suitable for work sessions', () => {
      expect(studioMidnightTheme).toBeDefined();
      const fromMatch = studioMidnightTheme?.preview.from.match(/oklch\(([0-9.]+)/);
      expect(fromMatch).not.toBeNull();
      const luminance = parseFloat(fromMatch![1]);
      expect(luminance).toBeLessThan(0.25); // Dark background for reduced glare
    });

    test('studioMidnight has cool tones (blue/cyan hue range)', () => {
      expect(studioMidnightTheme).toBeDefined();
      // Cool tones: blue/cyan hues typically 200-260 in oklch
      const accentMatch = studioMidnightTheme?.preview.accent.match(/oklch\([0-9.]+ [0-9.]+ ([0-9.]+)\)/);
      expect(accentMatch).not.toBeNull();
      const hue = parseFloat(accentMatch![1]);
      expect(hue).toBeGreaterThanOrEqual(180);
      expect(hue).toBeLessThanOrEqual(280);
    });
  });

  describe('New theme: editorialSlate (bold, presentation-ready)', () => {
    let editorialSlateTheme: ThemeOption | undefined;

    beforeEach(() => {
      editorialSlateTheme = customThemes.find((t) => t.id === 'editorialSlate');
    });

    test('editorialSlate theme exists', () => {
      expect(editorialSlateTheme).toBeDefined();
    });

    test('editorialSlate has a strong, distinctive palette', () => {
      expect(editorialSlateTheme).toBeDefined();
      // Should have saturated accent color (chroma > 0.15)
      const accentMatch = editorialSlateTheme?.preview.accent.match(/oklch\([0-9.]+ ([0-9.]+)/);
      expect(accentMatch).not.toBeNull();
      const chroma = parseFloat(accentMatch![1]);
      expect(chroma).toBeGreaterThan(0.15);
    });
  });
});

describe('Theme Token Surface Documentation', () => {
  // This test documents what tokens any theme CSS class must define
  test('documents expected CSS custom properties for themes', () => {
    expect(THEME_TOKEN_KEYS).toMatchInlineSnapshot(`
      [
        "background",
        "foreground",
        "card",
        "card-foreground",
        "popover",
        "popover-foreground",
        "primary",
        "primary-foreground",
        "secondary",
        "secondary-foreground",
        "muted",
        "muted-foreground",
        "accent",
        "accent-foreground",
        "destructive",
        "destructive-foreground",
        "border",
        "input",
        "ring",
        "chart-1",
        "chart-2",
        "chart-3",
        "chart-4",
        "chart-5",
        "sidebar",
        "sidebar-foreground",
        "sidebar-primary",
        "sidebar-primary-foreground",
        "sidebar-accent",
        "sidebar-accent-foreground",
        "sidebar-border",
        "sidebar-ring",
      ]
    `);
  });
});
