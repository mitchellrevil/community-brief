/**
 * Vitest setup file for frontend tests.
 * This file is run before each test file.
 */

import { afterAll, beforeAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock window.matchMedia which is not available in jsdom
// Required by next-themes and other libraries that use media queries
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  window.matchMedia = window.matchMedia || function(query: string) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  };
}

// Mock ResizeObserver which is not available in jsdom
// Required by some Radix UI components
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserverMock;

// Mock IntersectionObserver which is not available in jsdom
class IntersectionObserverMock {
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  callback: IntersectionObserverCallback;
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = '';
  thresholds = [];
}

window.IntersectionObserver = IntersectionObserverMock as any;

// Suppress console.error for expected test warnings
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: Array<unknown>) => {
    // Filter out known React warnings from test output
    const message = typeof args[0] === 'string' ? args[0] : '';
    if (
      message.includes('Warning: ReactDOM.render is no longer supported') ||
      message.includes('Warning: An update to') ||
      message.includes('act(...)') 
    ) {
      return;
    }
    originalError.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalError;
});
