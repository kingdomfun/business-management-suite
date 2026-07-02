import { writable } from "svelte/store";
import type { CalendarEvent, Employee, OrgConfig } from "./types";
import { DEFAULT_FINANCE } from "./finance";
import { piiKey } from "./access";
import { decryptField, isEncrypted } from "./crypto";

// The shared, public org directory (company info + employee list). It lives in
// a static config.json that managers publish; every device fetches it read-only,
// no login. Reads are network-first with a localStorage fallback so the
// directory still shows offline and updates propagate within a session.
//
// Sensitive employee fields (phone/email) are stored ENCRYPTED in config.json
// because the file is public. We fetch the raw (encrypted) config, then expose a
// DECRYPTED view (`orgConfig`) once the shared access key is available. Until
// then, encrypted fields are blanked so they never surface locked. The raw,
// still-encrypted config is kept for managers who re-publish. See lib/crypto.ts.

const CONFIG_URL = "config.json"; // relative to the page — resolves under the /<repo>/ base on Pages
const CACHE_KEY = "org-config-cache-v1";
const POLL_MS = 5 * 60_000; // re-check for new info every 5 min while open

export const emptyConfig: OrgConfig = {
  version: 0,
  company: { name: "" },
  employees: [],
  finance: DEFAULT_FINANCE,
};

const initialCache = loadCached();

/** The raw config exactly as fetched/cached — PII fields still encrypted. */
export const rawConfig = writable<OrgConfig>(initialCache);
/** The org directory shown in the UI — PII decrypted when unlocked, else blank. */
export const orgConfig = writable<OrgConfig>(emptyConfig);
/** True once a newer version arrives mid-session — drives the "updated" banner. */
export const configUpdated = writable(false);
/**
 * True once we've resolved the config at least once (cache hit, or first network
 * attempt completed). The access gate waits on this so it never flashes the app
 * before we know whether a gate is configured.
 */
export const configReady = writable(initialCache.version > 0);

let rawVersion = 0;

function loadCached(): OrgConfig {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as OrgConfig;
  } catch {
    /* ignore */
  }
  return emptyConfig;
}

function cache(cfg: OrgConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

// ---- decrypted view ---------------------------------------------------------
// Recompute `orgConfig` whenever the raw config or the access key changes. A
// monotonically increasing token guards against an older async pass overwriting
// a newer one (the key can flip while a decrypt is in flight).

let latestRaw: OrgConfig = emptyConfig;
let latestKey: CryptoKey | null = null;
let pass = 0;

rawConfig.subscribe((c) => {
  latestRaw = c;
  rawVersion = c.version;
  recompute();
});
piiKey.subscribe((k) => {
  latestKey = k;
  recompute();
});

async function recompute(): Promise<void> {
  const token = ++pass;
  const c = latestRaw;
  const key = latestKey;

  if (!key) {
    // Locked: hide encrypted fields so they never show scrambled; leave any
    // plaintext (legacy) fields untouched. The encrypted schedule blob (`sched`)
    // is dropped and its runtime fields blanked so no schedule leaks. Dated
    // events are private too, so they stay hidden (eventsEnc dropped) until unlock.
    const employees = c.employees.map((e) => {
      const { sched, ...rest } = e;
      return {
        ...rest,
        name: isEncrypted(e.name) ? "" : e.name,
        email: isEncrypted(e.email) ? "" : e.email,
        phone: isEncrypted(e.phone) ? "" : e.phone,
        ...(sched ? { templateId: undefined, customSchedule: undefined } : {}),
      };
    });
    const { eventsEnc, ...bare } = c;
    if (token === pass) orgConfig.set({ ...bare, employees, events: undefined });
    return;
  }

  const employees = await Promise.all(
    c.employees.map(async (e) => {
      const { sched, ...rest } = e;
      const out: Employee = {
        ...rest,
        name: await decryptField(key, e.name),
        email: await decryptField(key, e.email),
        phone: await decryptField(key, e.phone),
      };
      if (sched) {
        try {
          const json = await decryptField(key, sched);
          const parsed = json
            ? (JSON.parse(json) as { templateId?: string; customSchedule?: Employee["customSchedule"] })
            : {};
          out.templateId = parsed.templateId;
          out.customSchedule = parsed.customSchedule;
        } catch {
          /* bad / undecryptable blob → leave the schedule unset */
        }
      }
      return out;
    })
  );

  // Decrypt the dated-events blob back into `events` (drop the at-rest field).
  const { eventsEnc, ...bare } = c;
  let events = c.events;
  if (eventsEnc) {
    try {
      const json = await decryptField(key, eventsEnc);
      events = json ? (JSON.parse(json) as CalendarEvent[]) : undefined;
    } catch {
      events = undefined; // bad / undecryptable blob → no events rather than a leak
    }
  }

  if (token === pass) orgConfig.set({ ...bare, employees, events });
}

/**
 * Fetch the latest config (network-first). On a newer version, swap it in and
 * flag configUpdated. Offline / not-yet-deployed → keep the cached copy.
 */
export async function refreshConfig(): Promise<void> {
  try {
    const res = await fetch(CONFIG_URL, { cache: "no-cache" });
    if (!res.ok) return;
    const next = (await res.json()) as OrgConfig;
    if (typeof next.version !== "number") return;
    if (next.version !== rawVersion) {
      // Only a *higher* version after the first load counts as "new info";
      // the initial fill (rawVersion === 0) shouldn't trigger the banner.
      if (rawVersion > 0 && next.version > rawVersion) configUpdated.set(true);
      cache(next);
      rawConfig.set(next);
    }
  } catch {
    /* offline / not deployed — keep cached copy */
  }
}

/**
 * Keep the directory fresh: check now, on tab refocus, and on a timer.
 * Returns a cleanup fn.
 */
export function startConfigSync(): () => void {
  // Mark ready once the first attempt settles, so an online first-run (no cache)
  // still reaches a gate/open decision instead of loading forever.
  refreshConfig().finally(() => configReady.set(true));
  const onVisible = () => {
    if (document.visibilityState === "visible") refreshConfig();
  };
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(refreshConfig, POLL_MS);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(timer);
  };
}
