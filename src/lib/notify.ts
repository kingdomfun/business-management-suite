import { writable } from "svelte/store";
import type { AppState, ScheduleTemplate } from "./types";
import { nowView, alarmTimesFor, toMinutes } from "./schedule";
import { PERSONAL_TEMPLATE_ID } from "./templates";

/** The state + resolved schedule template the scheduler/alerts operate on. */
export interface ActiveSchedule {
  state: AppState;
  template: ScheduleTemplate;
}

// Notification bridge (PWA).
//   Best-effort in-session alerts (Notification API + Web Audio chime) that
//   fire on the hour while the app/tab is open. Use Focus mode (screen wake
//   lock) to keep the tab alive so the chime keeps firing.

// ---- Web audio chime -------------------------------------------------------

let audioCtx: AudioContext | null = null;

/** Play the alert sound for the given preset ("chime" | "bell" | "alarm"). */
export function playChime(sound: string = "chime"): void {
  try {
    audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const tone = (freq: number, t: number, dur: number, type: OscillatorType = "sine", peak = 0.3) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };
    if (sound === "bell") {
      // Single resonant ring with a high overtone, long decay.
      tone(880, now, 1.3, "sine", 0.35);
      tone(1320, now, 1.3, "sine", 0.14);
    } else if (sound === "alarm") {
      // Four insistent square-wave buzzes.
      for (let i = 0; i < 4; i++) tone(760, now + i * 0.22, 0.18, "square", 0.22);
    } else {
      // chime (default): two-tone rising.
      tone(660, now, 0.35, "sine", 0.3);
      tone(880, now + 0.18, 0.35, "sine", 0.3);
    }
  } catch {
    /* audio unavailable */
  }
}

// ---- Permissions -----------------------------------------------------------

export async function requestPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  const res = await Notification.requestPermission();
  return res === "granted";
}

// ---- Web in-session scheduler ----------------------------------------------

let webTimer: ReturnType<typeof setTimeout> | null = null;

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;

/** Minutes since local midnight for `now`, fractional. */
function minutesOfDay(now: Date): number {
  return (now.getHours() * 60 + now.getMinutes()) + (now.getSeconds() + now.getMilliseconds() / 1000) / 60;
}

/** The minutes-of-day this alarm should fire at: schedule block starts + an
 *  optional daily wake alarm (which fires regardless of the off-hours schedule). */
function alarmMinutes(active: ActiveSchedule): number[] {
  // Work schedules honour the focus window; the personal off-hours schedule doesn't.
  const respectHours = active.template.id !== PERSONAL_TEMPLATE_ID;
  const times = alarmTimesFor(active.template, active.state, respectHours);
  const wake = active.state.personal?.wakeAlarm;
  if (wake?.enabled) {
    const wmin = toMinutes(wake.time);
    if (!times.includes(wmin)) times.push(wmin);
  }
  return times.sort((a, b) => a - b);
}

/**
 * Milliseconds until the next scheduled alarm — the next schedule block start
 * (within focus hours) or the wake alarm. Rolls over to tomorrow's first alarm
 * once the day's alarms have passed. Falls back to an hourly re-check if nothing
 * is scheduled.
 */
function msToNextAlarm(active: ActiveSchedule, now: Date): number {
  const times = alarmMinutes(active);
  if (times.length === 0) return 60 * MS_PER_MIN;
  const nowMin = minutesOfDay(now);
  const next = times.find((t) => t > nowMin);
  if (next !== undefined) return Math.round((next - nowMin) * MS_PER_MIN);
  // All of today's alarms have passed → first alarm tomorrow.
  return Math.round((times[0] - nowMin) * MS_PER_MIN) + MS_PER_DAY;
}

function fireWebAlert(getActive: () => ActiveSchedule): void {
  const { state: s, template } = getActive();
  const view = nowView(template, s, new Date());
  // No active block means this tick is the wake alarm (the only alarm that fires
  // outside a block). Chime "Wake up"; otherwise stay quiet.
  if (!view) {
    if (!s.personal?.wakeAlarm?.enabled) return;
    playChime(s.settings.sound);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Wake up", { body: "Time to wake up.", tag: "schedule-tick" });
    }
    return;
  }
  playChime(s.settings.sound);
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification("Next block", { body: view.headline, tag: "schedule-tick" });
  }
}

/**
 * Start the web in-session scheduler. Fires at each standing-schedule block
 * start (within focus hours) while the app is open, regardless of which tab is
 * showing. Returns a stop function. Native platforms use the plugin instead.
 */
export function startWebScheduler(getActive: () => ActiveSchedule): () => void {
  stopWebScheduler();
  const tick = () => {
    fireWebAlert(getActive);
    webTimer = setTimeout(tick, msToNextAlarm(getActive(), new Date()));
  };
  webTimer = setTimeout(tick, msToNextAlarm(getActive(), new Date()));
  return stopWebScheduler;
}

export function stopWebScheduler(): void {
  if (webTimer) clearTimeout(webTimer);
  webTimer = null;
}

// ---- Break reminders -------------------------------------------------------
//   A lightweight periodic nudge ("Time to stretch", "Remember to drink water")
//   that rotates through the user's messages, surfaces on the Schedule tab via
//   `breakMessage`, and chimes — every N minutes during Focus hours.

/** The current break-reminder message to show on the Schedule tab, or null. */
export const breakMessage = writable<string | null>(null);

let breakTimer: ReturnType<typeof setInterval> | null = null;
let breakClear: ReturnType<typeof setTimeout> | null = null;
let breakIdx = 0;

/** True during the user's Focus hours (so reminders don't fire overnight). */
function withinFocusHours(s: AppState, now: Date): boolean {
  const { start, end } = s.settings.activeHours;
  const h = now.getHours();
  return h >= start && h < end;
}

function fireBreakReminder(getState: () => AppState): void {
  const s = getState();
  const br = s.settings.breakReminder;
  if (!br?.enabled) return;
  const msgs = br.messages.map((m) => m.trim()).filter(Boolean);
  if (msgs.length === 0) return;
  if (!withinFocusHours(s, new Date())) return;
  const msg = msgs[breakIdx % msgs.length];
  breakIdx++;
  breakMessage.set(msg);
  playChime(s.settings.sound);
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification("Break reminder", { body: msg, tag: "break-reminder" });
  }
  // Auto-dismiss the in-app banner after a minute if the user doesn't.
  if (breakClear) clearTimeout(breakClear);
  breakClear = setTimeout(() => breakMessage.set(null), 60_000);
}

/**
 * Start (or restart) the periodic break-reminder timer. Reads live state each
 * tick, so toggling the setting off between ticks simply produces no-op ticks.
 * Returns a stop function.
 */
export function startBreakReminders(getState: () => AppState): () => void {
  stopBreakReminders();
  const br = getState().settings.breakReminder;
  if (!br?.enabled) return stopBreakReminders;
  const every = Math.max(1, Math.round(br.everyMin || 20));
  breakTimer = setInterval(() => fireBreakReminder(getState), every * MS_PER_MIN);
  return stopBreakReminders;
}

export function stopBreakReminders(): void {
  if (breakTimer) clearInterval(breakTimer);
  if (breakClear) clearTimeout(breakClear);
  breakTimer = null;
  breakClear = null;
  breakMessage.set(null);
}

// ---- Test alert ------------------------------------------------------------

export async function testAlert(state: AppState, template: ScheduleTemplate): Promise<void> {
  await requestPermission();
  // Always fire on a test (ignore active-hours/view guards) so the user can
  // hear the exact sound they have selected on demand.
  playChime(state.settings.sound);
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    const view = nowView(template, state, new Date());
    new Notification("Test alert", {
      body: view ? view.headline : "Chime + notification are working.",
      tag: "schedule-test",
    });
  }
}
