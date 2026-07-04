import { writable } from "svelte/store";
import type { AppState, BlockInstance, CalendarEvent, MonthlyReport } from "./types";
import { defaultState } from "./defaults";
import { toMinutes } from "./schedule";

const STORAGE_KEY = "schedule-app-state-v1";

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Shallow-merge over defaults so new fields added in later versions
      // don't break an older saved state.
      const saved = JSON.parse(raw) as Partial<AppState>;
      const base = defaultState();
      return { ...base, ...saved };
    }
  } catch {
    /* fall through to defaults */
  }
  return defaultState();
}

export const state = writable<AppState>(load());

state.subscribe((s) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full / unavailable — ignore */
  }
});

/** Apply a mutation to the current state and persist it. */
export function update(fn: (s: AppState) => void): void {
  state.update((s) => {
    const next = structuredClone(s);
    fn(next);
    return next;
  });
}

/** Get or create the per-date, per-block instance record. */
function blockInstance(s: AppState, date: string, time: string): BlockInstance {
  const day = (s.days[date] ??= { blocks: {} });
  return (day.blocks[time] ??= {});
}

export function setTaskNote(date: string, time: string, note: string): void {
  update((s) => {
    const inst = blockInstance(s, date, time);
    if (note) inst.taskNote = note;
    else delete inst.taskNote;
  });
}

export function toggleStep(date: string, time: string, step: string): void {
  update((s) => {
    const inst = blockInstance(s, date, time);
    inst.checklist ??= {};
    inst.checklist[step] = !inst.checklist[step];
  });
}

/** Set (or clear) which employee this device belongs to — drives the schedule. */
export function setMyEmployeeId(id: string | undefined): void {
  update((s) => {
    if (id) s.myEmployeeId = id;
    else delete s.myEmployeeId;
  });
}

// ---- Break reminders -------------------------------------------------------

/** Default break reminders if a saved state predates the field. */
function ensureBreakReminder(s: AppState): NonNullable<AppState["settings"]["breakReminder"]> {
  return (s.settings.breakReminder ??= { enabled: false, everyMin: 20, messages: [] });
}

export function setBreakReminderEnabled(enabled: boolean): void {
  update((s) => {
    ensureBreakReminder(s).enabled = enabled;
  });
}

export function setBreakReminderEvery(everyMin: number): void {
  update((s) => {
    if (everyMin > 0) ensureBreakReminder(s).everyMin = everyMin;
  });
}

/** Replace the rotating message list from raw text (one message per line). */
export function setBreakReminderMessages(text: string): void {
  update((s) => {
    ensureBreakReminder(s).messages = text
      .split("\n")
      .map((m) => m.trim())
      .filter(Boolean);
  });
}

// ---- Personal off-hours schedule -------------------------------------------

export function setPersonalEnabled(enabled: boolean): void {
  update((s) => {
    s.personal.enabled = enabled;
  });
}

/** Default wake alarm if a saved state predates the field. */
function ensureWakeAlarm(s: AppState): NonNullable<AppState["personal"]["wakeAlarm"]> {
  return (s.personal.wakeAlarm ??= { enabled: false, time: "06:00" });
}

export function setWakeAlarmEnabled(enabled: boolean): void {
  update((s) => {
    ensureWakeAlarm(s).enabled = enabled;
  });
}

export function setWakeAlarmTime(time: string): void {
  update((s) => {
    if (time) ensureWakeAlarm(s).time = time;
  });
}

/** Add a personal block, keeping the list sorted by time. */
export function addPersonalBlock(): void {
  update((s) => {
    s.personal.blocks = [...s.personal.blocks, { time: "12:00", label: "New block" }].sort(
      (a, b) => toMinutes(a.time) - toMinutes(b.time)
    );
  });
}

export function updatePersonalBlock(index: number, patch: { time?: string; label?: string; detail?: string }): void {
  update((s) => {
    const b = s.personal.blocks[index];
    if (!b) return;
    if (patch.time !== undefined) b.time = patch.time;
    if (patch.label !== undefined) b.label = patch.label;
    if (patch.detail !== undefined) {
      if (patch.detail.trim()) b.detail = patch.detail;
      else delete b.detail;
    }
    s.personal.blocks.sort((a, b2) => toMinutes(a.time) - toMinutes(b2.time));
  });
}

export function removePersonalBlock(index: number): void {
  update((s) => {
    s.personal.blocks = s.personal.blocks.filter((_, i) => i !== index);
  });
}

// ---- Personal one-off appointments -----------------------------------------

/** Sort events chronologically (date, then time). */
function byDateTime(a: CalendarEvent, b: CalendarEvent): number {
  return a.date.localeCompare(b.date) || toMinutes(a.time) - toMinutes(b.time);
}

export function addEvent(e: Omit<CalendarEvent, "id">): void {
  update((s) => {
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    (s.events ??= []).push({ id, ...e });
    s.events.sort(byDateTime);
  });
}

export function updateEvent(id: string, patch: Partial<Omit<CalendarEvent, "id">>): void {
  update((s) => {
    const ev = s.events?.find((x) => x.id === id);
    if (!ev) return;
    if (patch.date !== undefined) ev.date = patch.date;
    if (patch.time !== undefined) ev.time = patch.time;
    if (patch.label !== undefined) ev.label = patch.label;
    if (patch.detail !== undefined) {
      if (patch.detail.trim()) ev.detail = patch.detail;
      else delete ev.detail;
    }
    if (patch.replacesDay !== undefined) ev.replacesDay = patch.replacesDay;
    (s.events ??= []).sort(byDateTime);
  });
}

export function removeEvent(id: string): void {
  update((s) => {
    s.events = (s.events ?? []).filter((x) => x.id !== id);
  });
}

/** Unlock the management tools (after password or biometric verification). */
export function adminUnlock(): void {
  update((s) => {
    s.manage = { signedIn: true };
  });
}

export function adminLock(): void {
  update((s) => {
    s.manage = { signedIn: false };
  });
}

/** Add or replace the monthly report for a given month (newest data wins). */
export function saveReport(entry: Omit<MonthlyReport, "id">): void {
  update((s) => {
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const existing = s.reports.findIndex((r) => r.month === entry.month);
    if (existing >= 0) s.reports[existing] = { ...s.reports[existing], ...entry };
    else s.reports.push({ id, ...entry });
  });
}

export function removeReport(id: string): void {
  update((s) => {
    s.reports = s.reports.filter((r) => r.id !== id);
  });
}

export function resetState(): void {
  state.set(defaultState());
}
