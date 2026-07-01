// Per-tool password locks (see types.ToolLock). A manager can protect any
// non-admin tool with a named password ("Finance Officer" → Payroll), letting a
// scoped user open just that tool without a GitHub token / manager access.
//
// SECURITY NOTE: this is a client-side gate — the tool code ships in the public
// bundle and the verifier is public, so a determined user can bypass it in
// devtools. It's a deterrent that keeps protected tools out of casual reach, not
// real authentication. For genuine protection, encrypt the tool's data under the
// lock password (as PII fields are). Managers (admin/PAT-unlocked) bypass locks.

import { writable, get } from "svelte/store";
import type { OrgConfig, ToolLock } from "./types";
import { deriveKey, checkVerifier } from "./crypto";

const STORE_KEY = "schedule-tool-locks-v1";

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return [];
}

/** Lock ids the user has entered the password for, remembered on this device. */
export const unlockedLocks = writable<string[]>(load());
unlockedLocks.subscribe((ids) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — they'll re-enter next launch */
  }
});

/** The lock guarding `toolId`, or null if the tool isn't lock-protected. */
export function lockForTool(config: OrgConfig, toolId: string): ToolLock | null {
  return config.access?.locks?.find((l) => l.tools.includes(toolId)) ?? null;
}

/**
 * The lock a user must still clear to open `toolId`, or null if it's openable
 * (not protected, already unlocked, or the user is an admin who bypasses locks).
 */
export function pendingLock(
  config: OrgConfig,
  toolId: string,
  adminUnlocked: boolean,
  unlockedIds: string[]
): ToolLock | null {
  if (adminUnlocked) return null;
  const lock = lockForTool(config, toolId);
  if (!lock) return null;
  return unlockedIds.includes(lock.id) ? null : lock;
}

/** Verify `password` against a lock; on success remember it unlocked. */
export async function tryUnlockLock(lock: ToolLock, password: string): Promise<boolean> {
  const key = await deriveKey(password, lock.salt);
  if (!(await checkVerifier(key, lock.verifier))) return false;
  unlockedLocks.update((ids) => (ids.includes(lock.id) ? ids : [...ids, lock.id]));
  return true;
}

/** Forget all remembered tool unlocks (pair with a manager "lock" / sign-out). */
export function clearLockUnlocks(): void {
  unlockedLocks.set([]);
}

/** Snapshot of currently-unlocked lock ids (non-reactive read). */
export function unlockedSnapshot(): string[] {
  return get(unlockedLocks);
}
