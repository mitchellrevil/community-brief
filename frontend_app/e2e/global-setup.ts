import fs from 'node:fs/promises';
import {  chromium, request } from '@playwright/test';
import {
  
  backendBaseURL,
  backendHealthPath,
  e2eDir,
  frontendBaseURL,
  getCredentialsByRole,
  loginPath,
  storageStatePath
} from './utils/config';
import type {FullConfig} from '@playwright/test';

import type {E2ERole} from './utils/config';

async function ensureE2EDir(): Promise<void> {
  await fs.mkdir(e2eDir, { recursive: true });
}

async function storageStateExists(role: 'anon' | E2ERole): Promise<boolean> {
  try {
    await fs.access(storageStatePath(role));
    return true;
  } catch {
    return false;
  }
}

async function hasReusableStorageStates(): Promise<boolean> {
  const roles: Array<'anon' | E2ERole> = ['anon', 'user', 'editor', 'admin'];
  const results = await Promise.all(roles.map((role) => storageStateExists(role)));
  return results.every(Boolean);
}

async function waitForBackendReady(): Promise<void> {
  const timeoutMs = Number(process.env.E2E_BACKEND_WAIT_MS || 60_000);
  const start = Date.now();

  const ctx = await request.newContext({ baseURL: backendBaseURL });
  try {
    // Poll until health responds.
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await ctx.get(backendHealthPath, { timeout: 5_000 });
        if (res.ok()) return;
      } catch {
        // ignore and retry
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    throw new Error(
      `Backend not ready after ${timeoutMs}ms. Ensure backend is running at ${backendBaseURL} (health: ${backendHealthPath}).`,
    );
  } finally {
    await ctx.dispose();
  }
}

async function createAnonStorageState(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Visit the frontend so localStorage/sessionStorage origin is present in storageState.
    await page.goto(`${frontendBaseURL}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // ignore
      }
    });

    await context.storageState({ path: storageStatePath('anon') });
    await context.close();
  } finally {
    await browser.close();
  }
}

async function createRoleStorageState(role: E2ERole, email: string, password: string): Promise<void> {
  // Use a dedicated request context per role so cookie jars do not overlap.
  const api = await request.newContext({ baseURL: backendBaseURL });

  let permission: string | undefined;

  try {
    const res = await api.post(loginPath, {
      data: { email, password },
      timeout: 15_000,
    });

    // Avoid logging secrets; include only status.
    if (!res.ok()) {
      const status = res.status();
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        // ignore
      }

      if (status === 429) {
        throw new Error(
          `Login rate-limited (HTTP 429) while creating storage state for role "${role}". ` +
            `Wait a minute and retry, or start backend with DISABLE_LOGIN_RATE_LIMITER=1 for E2E runs. ` +
            `Response: ${bodyText.slice(0, 200)}`,
        );
      }

      throw new Error(
        `Login failed (HTTP ${status}) while creating storage state for role "${role}". ` +
          `Response: ${bodyText.slice(0, 200)}`,
      );
    }

    const data: any = await res.json().catch(() => ({}));
    permission = data?.permission || data?.user?.permission;

    const apiState = await api.storageState();

    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      if (apiState.cookies.length) {
        await context.addCookies(apiState.cookies);
      }

      const page = await context.newPage();
      await page.goto(`${frontendBaseURL}/simple-upload`, { waitUntil: 'domcontentloaded' }).catch(() => {});

      // Optional hint: the app stores this after successful login; not required for auth.
      if (permission) {
        await page.evaluate((p) => {
          try {
            localStorage.setItem('permission', p);
          } catch {
            // ignore
          }
        }, String(permission));
      }

      await context.storageState({ path: storageStatePath(role) });
      await context.close();
    } finally {
      await browser.close();
    }
  } finally {
    await api.dispose();
  }
}

export default async function globalSetup(_config: FullConfig) {
  await ensureE2EDir();
  await waitForBackendReady();

  if (await hasReusableStorageStates()) {
    return;
  }

  await createAnonStorageState();

  const creds = await getCredentialsByRole();

  // Generate role states (serially) to minimize rate-limit risk.
  await createRoleStorageState('user', creds.user.email, creds.user.password);
  await createRoleStorageState('editor', creds.editor.email, creds.editor.password);
  await createRoleStorageState('admin', creds.admin.email, creds.admin.password);
}
