import { API_V1_BASE } from '@/shared/api/constants';

export const TEST_API_BASE = API_V1_BASE;

export function apiPath(path: string): string {
  return `${TEST_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
