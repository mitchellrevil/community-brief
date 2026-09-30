/**
 * Debug utilities for Prompt Management
 * Provides structured logging for debugging the tree rendering and updates
 */

// Debugging disabled in production builds. Replace with no-op to avoid leaking logs or global state.

class NoopDebugLogger {
  info(_component: string, _action: string, _data?: any) {}
  warn(_component: string, _action: string, _data?: any) {}
  error(_component: string, _action: string, _data?: any) {}
  debug(_component: string, _action: string, _data?: any) {}
  getLogs() { return [] as Array<any> }
  clearLogs() {}
  exportLogs() { return '[]' }
}

export const debugLogger = new NoopDebugLogger();

