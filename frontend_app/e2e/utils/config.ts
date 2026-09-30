import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type E2ERole = 'user' | 'editor' | 'admin';

export interface Credentials {
  email: string;
  password: string;
}

export const frontendBaseURL = (process.env.E2E_FRONTEND_URL || 'http://localhost:3000').trim();
export const backendBaseURL = (process.env.E2E_BACKEND_URL || 'http://localhost:8000').trim();

// Backend endpoints (relative to backendBaseURL)
export const backendHealthPath = (process.env.E2E_BACKEND_HEALTH_PATH || '/health/ready').trim();
export const apiV1Path = (pathName = ''): string => {
  const normalized = pathName.startsWith('/') ? pathName : `/${pathName}`;
  return `/api/v1${normalized === '/' ? '' : normalized}`;
};
export const backendApiV1Url = (pathName = ''): string => `${backendBaseURL}${apiV1Path(pathName)}`;
export const loginPath = (process.env.E2E_LOGIN_PATH || apiV1Path('/auth/login')).trim();

const utilsDir = path.dirname(fileURLToPath(import.meta.url)); // frontend_app/e2e/utils
export const e2eDir = path.resolve(utilsDir, '..'); // frontend_app/e2e
export const frontendAppDir = path.resolve(e2eDir, '..'); // frontend_app
export const repoRootDir = path.resolve(frontendAppDir, '..'); // repo root

function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();
    if (!key) continue;

    const unquoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value;

    result[key] = unquoted;
  }

  return result;
}

function loadLocalEnvFiles(): void {
  const candidates = [
    path.join(repoRootDir, '.env'),
    path.join(repoRootDir, '.env.local'),
    path.join(frontendAppDir, '.env'),
    path.join(frontendAppDir, '.env.local'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;

    const parsed = parseDotEnv(readFileSync(candidate, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadLocalEnvFiles();

export function storageStateRef(role: 'anon' | E2ERole): string {
  // File reference used in Playwright config/tests (relative to frontend_app).
  return `e2e/storageState.${role}.json`;
}

export function storageStatePath(role: 'anon' | E2ERole): string {
  // Absolute filesystem path for writing/removing files.
  return path.join(e2eDir, `storageState.${role}.json`);
}

function envCredentials(role: E2ERole): Credentials | null {
  const prefix = `E2E_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

function inferRoleFromEmail(email: string): E2ERole {
  const localPart = email.split('@')[0]?.toLowerCase() || '';
  if (localPart.startsWith('admin')) return 'admin';
  if (localPart.startsWith('editor')) return 'editor';
  return 'user';
}

async function readPasswordsFile(filePath: string): Promise<Partial<Record<E2ERole, Credentials>>> {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(repoRootDir, filePath);
  if (process.env.E2E_DEBUG === '1' || process.env.E2E_DEBUG === 'true') {
    // Never log file contents (may contain secrets) - only the resolved path.
     
    console.log(`[e2e] reading passwords file: ${abs}`);
  }
  const raw = await fs.readFile(abs, 'utf8');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const result: Partial<Record<E2ERole, Credentials>> = {};
  for (const line of lines) {
    if (line.startsWith('#')) continue;

    // Format: email,password
    const parts = line.split(',');
    if (parts.length < 2) continue;

    const email = parts[0]?.trim();
    const password = parts.slice(1).join(',').trim();
    if (!email || !password) continue;

    const role = inferRoleFromEmail(email);
    result[role] = { email, password };
  }

  return result;
}

async function passwordsFileExists(filePath: string): Promise<boolean> {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(repoRootDir, filePath);
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

export async function getCredentialsByRole(): Promise<Record<E2ERole, Credentials>> {
  // Primary: explicit env vars per role.
  const fromEnv: Partial<Record<E2ERole, Credentials>> = {};
  const user = envCredentials('user');
  const editor = envCredentials('editor');
  const admin = envCredentials('admin');
  if (user) fromEnv.user = user;
  if (editor) fromEnv.editor = editor;
  if (admin) fromEnv.admin = admin;

  // Optional: passwords file (only if explicitly opted in).
  const passwordsFile = (process.env.E2E_PASSWORDS_FILE || '.env.passwords').trim();
  const hasPasswordsFile = await passwordsFileExists(passwordsFile);
  const usePasswordsFile =
    process.env.E2E_USE_PASSWORDS_FILE === '1' ||
    process.env.E2E_USE_PASSWORDS_FILE === 'true' ||
    Boolean(process.env.E2E_PASSWORDS_FILE) ||
    hasPasswordsFile;

  let fromFile: Partial<Record<E2ERole, Credentials>> = {};
  if (usePasswordsFile) {
    try {
      fromFile = await readPasswordsFile(passwordsFile);
    } catch {
      // Ignore file errors; we'll validate below.
      fromFile = {};
    }
  }

  if (process.env.E2E_DEBUG === '1' || process.env.E2E_DEBUG === 'true') {
     
    console.log(`[e2e] usePasswordsFile=${String(usePasswordsFile)}; fromFile roles=${Object.keys(fromFile).join(',') || '(none)'}`);
    const envRoles = ['user', 'editor', 'admin'].filter((r) => Boolean((fromEnv as any)[r]));
     
    console.log(`[e2e] fromEnv roles=${envRoles.join(',') || '(none)'}`);
  }

  const merged: Partial<Record<E2ERole, Credentials>> = {
    ...fromFile,
    ...fromEnv,
  };

  const missing: Array<string> = [];
  if (!merged.user) missing.push('user');
  if (!merged.editor) missing.push('editor');
  if (!merged.admin) missing.push('admin');

  if (missing.length) {
    const needed = missing
      .map((r) => `E2E_${r.toUpperCase()}_EMAIL + E2E_${r.toUpperCase()}_PASSWORD`)
      .join(', ');

    throw new Error(
      `Missing E2E credentials for roles: ${missing.join(', ')}. Provide env vars (${needed}) ` +
        `or add a local .env.passwords file at the repo root, or set E2E_USE_PASSWORDS_FILE=1 ` +
        `(and optionally E2E_PASSWORDS_FILE) to load from a local file.`,
    );
  }

  return merged as Record<E2ERole, Credentials>;
}
