import type { AppState } from "./types";

// The seed app state on first launch. The daily schedule itself is no longer
// stored here — it comes from the role-based template library (lib/templates.ts),
// resolved from the org directory + this device's employee identity. This holds
// only device-local data: settings, the per-day task layer, and admin/report state.

export function defaultState(): AppState {
  return {
    days: {},
    reports: [],
    // One-off appointments the user adds on this device (Settings → My appointments).
    events: [],
    // A starter personal off-hours routine, disabled by default. The user can
    // enable it + edit the blocks in Settings to use the tool outside work hours.
    // Nights (10 PM–6 AM) default to Sleep; the two Sleep blocks bridge midnight
    // so the period reads as Sleep continuously. An optional wake alarm (off by
    // default) chimes at its set time regardless of the off-hours schedule.
    personal: {
      enabled: false,
      wakeAlarm: { enabled: false, time: "06:00" },
      blocks: [
        { time: "00:00", label: "Sleep" },
        { time: "06:00", label: "Morning Routine" },
        { time: "18:00", label: "Evening / Family" },
        { time: "21:00", label: "Wind Down" },
        { time: "22:00", label: "Sleep" },
      ],
    },
    settings: {
      activeHours: { start: 9, end: 17 }, // 9 AM–5 PM; covers the standing schedule
      alertStyle: "persistent",
      sound: "chime",
      // Off by default; when on, a rotating nudge appears on the Schedule tab
      // every 20 min during Focus hours. Edit the messages in Settings → Alerts.
      breakReminder: {
        enabled: false,
        everyMin: 20,
        messages: ["Time to stretch 🧘", "Remember to drink water 💧", "Rest your eyes — look far away for 20s 👀"],
      },
    },
    manage: { signedIn: false },
  };
}
