import fs from 'node:fs/promises';

import {  storageStatePath } from './utils/config';
import type {E2ERole} from './utils/config';

const roles: Array<'anon' | E2ERole> = ['anon', 'user', 'editor', 'admin'];

export default async function globalTeardown() {
  const cleanup = process.env.E2E_CLEANUP_STORAGE_STATE;
  if (cleanup !== '1' && cleanup !== 'true') return;

  await Promise.all(
    roles.map(async (role) => {
      try {
        await fs.rm(storageStatePath(role), { force: true });
      } catch {
        // ignore
      }
    }),
  );
}
