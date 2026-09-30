import * as React from 'react';
import { ThemeProvider } from 'next-themes';

/**
 * Theme configuration for testing
 */
export interface TestThemeConfig {
  /** The default theme to use in tests */
  defaultTheme?: 'light' | 'dark' | 'system';
  /** Whether to force a specific theme (disables system theme detection) */
  forcedTheme?: 'light' | 'dark';
  /** Whether to enable system theme (defaults to false in tests for consistency) */
  enableSystem?: boolean;
  /** Disable transitions for consistent snapshots */
  disableTransitionOnChange?: boolean;
}

/**
 * Props for the TestTheme component
 */
export interface TestThemeProps {
  children: React.ReactNode;
  config?: TestThemeConfig;
}

/**
 * Default theme configuration for testing.
 * Uses light theme with transitions disabled for consistent test results.
 */
export const defaultTestThemeConfig: TestThemeConfig = {
  defaultTheme: 'light',
  forcedTheme: 'light',
  enableSystem: false,
  disableTransitionOnChange: true,
};

/**
 * Test Theme Provider that wraps the next-themes ThemeProvider
 * with sensible defaults for testing.
 * 
 * - Defaults to light theme for consistent test results
 * - Disables system theme detection to avoid flaky tests
 * - Disables transitions for faster tests and consistent snapshots
 */
export function TestTheme({ children, config = defaultTestThemeConfig }: TestThemeProps) {
  const mergedConfig = { ...defaultTestThemeConfig, ...config };

  return React.createElement(
    ThemeProvider,
    {
      attribute: 'class',
      defaultTheme: mergedConfig.defaultTheme,
      forcedTheme: mergedConfig.forcedTheme,
      enableSystem: mergedConfig.enableSystem,
      disableTransitionOnChange: mergedConfig.disableTransitionOnChange,
      storageKey: 'test-theme', // Use a different storage key to avoid conflicts
    },
    children
  );
}

/**
 * Theme configurations for different test scenarios
 */
export const themeConfigs = {
  light: {
    defaultTheme: 'light' as const,
    forcedTheme: 'light' as const,
    enableSystem: false,
    disableTransitionOnChange: true,
  },
  dark: {
    defaultTheme: 'dark' as const,
    forcedTheme: 'dark' as const,
    enableSystem: false,
    disableTransitionOnChange: true,
  },
  system: {
    defaultTheme: 'system' as const,
    forcedTheme: undefined,
    enableSystem: true,
    disableTransitionOnChange: true,
  },
};

export default TestTheme;
