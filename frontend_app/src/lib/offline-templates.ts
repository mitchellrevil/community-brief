import type { AuthSessionUser } from "@/features/auth/data/types";
import type { Folder, PromptTemplate } from "@/shared/data/templates";

const SESSION_KEY = "community-offline-session-v1";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
type Session = { user: AuthSessionUser; savedAt: number };
export type OfflineTemplates = { scope: string; savedAt: number; folders: Array<Folder>; templates: Array<PromptTemplate> };
const scopeOf = (user: AuthSessionUser) => JSON.stringify([user.user_id, user.permission, user.business_unit_id, [...(user.business_unit_ids ?? [])].sort()]);

function session(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return value?.user.user_id && Date.now() - value.savedAt < MAX_AGE ? value : null;
  } catch { return null; }
}

export function rememberOfflineUser(user: AuthSessionUser) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user, savedAt: Date.now() })); } catch { /* Offline setup reports unavailable storage. */ }
}

export function getOfflineUser() {
  return navigator.onLine ? null : session()?.user ?? null;
}

export function clearOfflineUser() {
  localStorage.removeItem(SESSION_KEY);
  // Removing the identity immediately makes in-flight and persisted snapshots inaccessible.
  void openDB().then((db) => {
    const tx = db.transaction("catalogue", "readwrite");
    tx.objectStore("catalogue").clear();
    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
  }).catch(() => {});
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("CommunityBriefOfflineTemplates", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("catalogue", { keyPath: "scope" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readOfflineTemplates(): Promise<OfflineTemplates> {
  const user = session()?.user;
  if (!user) throw new Error("Sign in online to prepare recording templates on this device.");
  const scope = scopeOf(user);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("catalogue", "readonly");
    const request = tx.objectStore("catalogue").get(scope);
    request.onsuccess = () => {
      const value = request.result as OfflineTemplates | undefined;
      if (value && Date.now() - value.savedAt < MAX_AGE && scopeOf(session()?.user ?? user) === scope && session()) resolve(value);
      else reject(new Error("Recording templates are not ready offline. Connect and prepare them first."));
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

let pending: { scope: string; promise: Promise<OfflineTemplates> } | null = null;
const isBrowserOnline = (): boolean => navigator.onLine;

export function prepareOfflineTemplates(user: AuthSessionUser): Promise<OfflineTemplates> {
  const scope = scopeOf(user);
  if (pending?.scope === scope) return pending.promise;
  const promise = (async () => {
    if (!isBrowserOnline()) return readOfflineTemplates();
    const { listAllFolders, listAllTemplates } = await import("@/shared/data/templates");
    // The list endpoint returns complete templates, including talking points and consent text.
    // Reuse those records instead of requesting every subcategory again by ID.
    const [folders, templates] = await Promise.all([listAllFolders("runtime"), listAllTemplates("runtime")]);
    if (!isBrowserOnline()) throw new Error("Connection lost during offline preparation. Retry when online.");
    const snapshot = { scope, savedAt: Date.now(), folders, templates };
    if (!session() || scopeOf(session()!.user) !== scope) throw new Error("Account changed during offline preparation.");
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("catalogue", "readwrite");
      tx.objectStore("catalogue").put(snapshot);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
    return snapshot;
  })();
  pending = { scope, promise };
  void promise.finally(() => { if (pending?.promise === promise) pending = null; }).catch(() => {});
  return promise;
}

export function offlinePage<T>(items: Array<T>, limit: number, offset: number) {
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset, has_more: offset + limit < items.length };
}
