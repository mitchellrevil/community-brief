export function e2eId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

export function e2eName(prefix: string): string {
  return `E2E ${prefix} ${e2eId('run')}`;
}
