// Core data model for the schedule app. Kept intentionally small: the entire
// app state is one JSON-serialisable object persisted to localStorage.

/**
 * One field of an end-of-day planning form. Whatever the user types is written
 * to the matching block on the *next* day so it resurfaces in that time slot.
 */
export interface PlanTarget {
  /** stable field key */
  key: string;
  /** the "HH:MM" block tomorrow this field feeds into */
  time: string;
  /** form label, e.g. "Primary task" */
  label: string;
}

/** A single hour block in the day, e.g. { time: "09:00", label: "Deep Work" }. */
export interface Block {
  /** 24h "HH:MM" start time (interpreted in the device's local timezone). */
  time: string;
  label: string;
  /** Optional one-line hint shown under the label. */
  detail?: string;
  /** Optional per-step checklist (the boxes shown under "Process"). */
  checklist?: string[];
  /** Optional per-step planning inputs that feed tomorrow's matching blocks. */
  plan?: PlanTarget[];
  /**
   * Runtime-only marker: this block was injected from a dated CalendarEvent (a
   * one-off appointment), so the UI can badge it. Never persisted on a template.
   */
  event?: boolean;
}

export type AlertStyle = "persistent" | "standard";

/**
 * A daily work schedule for a kind of role (software, construction, childcare…).
 * Management assigns one to each employee; the device shows the assigned one.
 * Checklists and planning inputs are configured per block (see Block).
 */
export interface ScheduleTemplate {
  /** stable id, e.g. "construction" */
  id: string;
  /** display name, e.g. "Construction" */
  name: string;
  /** one-line description of who this is for */
  description: string;
  /** sort order in the picker (lower first); defaults to 0 */
  order?: number;
  /** the day's hour blocks */
  blocks: Block[];
}

/** A company-wide day off, shown instead of the schedule on that date. */
export interface Holiday {
  /** "YYYY-MM-DD" */
  date: string;
  /** display name, e.g. "Christmas Day" */
  name: string;
}

/**
 * A one-off dated appointment or special day laid over the standing schedule —
 * e.g. "Call client at 1 PM" or a whole-day event with a bespoke schedule.
 * Company events (published in config.json) and personal events (device-local)
 * share this shape. On its `date` the event appears as a block at `time`.
 */
export interface CalendarEvent {
  /** stable unique id */
  id: string;
  /** "YYYY-MM-DD" the event lands on */
  date: string;
  /** "HH:MM" start time — the event shows as a block at this time */
  time: string;
  label: string;
  /** optional one-line hint shown under the label */
  detail?: string;
  /**
   * Company events only: whom it applies to. Empty/undefined = the whole company;
   * otherwise the employee ids it targets. (Personal events ignore this field.)
   */
  employeeIds?: string[];
  /**
   * When true, this date's applicable events REPLACE the normal schedule for the
   * people it applies to (a one-off "special day") instead of overlaying on top.
   */
  replacesDay?: boolean;
  /**
   * Marks this dated event as a day of leave that counts against the targeted
   * employees' yearly allowance (see Employee.sickAllowance / holidayAllowance).
   * Only counts for events with explicit `employeeIds`. Undefined = a normal
   * appointment that doesn't consume any allowance. See lib/leave.ts.
   */
  leaveType?: "sick" | "holiday";
}

/** Per-date instance data: the task layer laid over the standing schedule. */
export interface DayData {
  /** keyed by block "HH:MM" */
  blocks: Record<string, BlockInstance>;
}

export interface BlockInstance {
  taskNote?: string;
  /** checklist step -> done */
  checklist?: Record<string, boolean>;
}

export interface Settings {
  activeHours: { start: number; end: number }; // hours 0-23, inclusive start, inclusive end
  alertStyle: AlertStyle;
  sound: string;
  /**
   * Optional periodic break reminders. When enabled, a rotating message
   * (e.g. "Time to stretch", "Remember to drink water") surfaces on the
   * Schedule tab — and chimes — every `everyMin` minutes during Focus hours.
   * Optional so older saved states parse.
   */
  breakReminder?: { enabled: boolean; everyMin: number; messages: string[] };
}

/**
 * A device-local personal schedule for off-hours / weekends — lets someone use
 * the schedule tool + alarms for personal routines outside their work hours.
 */
export interface PersonalSchedule {
  /** when true, this schedule takes over during off-hours and weekends */
  enabled: boolean;
  /** the personal day's hour blocks */
  blocks: Block[];
  /**
   * Optional daily wake-up alarm. Fires a chime at `time` regardless of whether
   * the off-hours schedule is enabled. Optional so older saved states parse.
   */
  wakeAlarm?: { enabled: boolean; time: string };
}

/** Admin gate state — whether management tools are unlocked (see AdminGate.svelte). */
export interface ManageAuth {
  signedIn: boolean;
}

/** Staff seniority, used to order the HR directory (managers first). */
export type WorkerRole = "manager" | "senior" | "general";

/**
 * A team member in the public org directory (config.json). Most fields are
 * public; contact details (email/phone) are encrypted at rest — see below.
 * Edited by managers in the Management tool, read by everyone.
 */
export interface Employee {
  id: string;
  /**
   * Display name. Like the contact fields, it's ENCRYPTED-at-rest and blanked
   * while the directory is locked; decrypted once the access password is entered.
   */
  name: string;
  role: WorkerRole;
  /**
   * Private fields. Stored ENCRYPTED-at-rest in config.json ("enc:v1:…" blobs)
   * because that file is public; they're decrypted for display once the user
   * enters the shared access password. See lib/crypto.ts + lib/access.ts. May
   * also be plaintext in legacy configs (decryptField passes those through).
   */
  email?: string;
  phone?: string;
  /**
   * Schedule assignment — RUNTIME only. The schedule is private, so at rest it's
   * encrypted into `sched` (below) rather than published in plaintext; config.ts
   * decrypts it back into these two fields. `customSchedule` (when present) takes
   * precedence over `templateId`.
   */
  templateId?: string;
  customSchedule?: { blocks: Block[] };
  /**
   * AT-REST only: the encrypted JSON of `{ templateId?, customSchedule? }`. Absent
   * at runtime (config.ts expands it back into the two fields above on unlock).
   */
  sched?: string;
  /** Optional public profile links, label -> url (e.g. { linkedin, github }). */
  links?: Record<string, string>;
  /**
   * Yearly leave allowances in whole days, set by a manager. Days are "used" by
   * dated leave events on the calendar (CalendarEvent.leaveType); used/remaining
   * is derived, never stored. Absent/0 = no allowance configured. See lib/leave.ts.
   */
  sickAllowance?: number;
  holidayAllowance?: number;
}

/** Publicly-postable company details shown at the top of the HR tab. */
export interface CompanyInfo {
  name: string;
  registrationNumber?: string;
  website?: string;
  /** Social/community links, label -> url (e.g. { discord, linkedin, instagram }). */
  social?: Record<string, string>;
}

/** A single internal reserve fund, taken as a percent of the post-tax pool. */
export interface ReserveItem {
  /** stable key, e.g. "tools" */
  key: string;
  label: string;
  /** percent of the post-tax revenue pool (Step 2) */
  pct: number;
}

/**
 * Company budget/wage policy. Drives the Business tab and the reporting tool.
 * Lives in the shared config.json so the whole team sees the same model.
 */
export interface FinanceConfig {
  /** currency symbol shown before amounts, e.g. "$". */
  currency: string;
  /** tax reserve as a percent of gross income (Step 1). */
  taxReservePct: number;
  /** internal reserve funds, each a percent of the post-tax pool (Step 2). */
  reserves: ReserveItem[];
  /** wage multiplier per role; management is capped at 2x. */
  roleMultipliers: Record<WorkerRole, number>;
  /** planning estimate of monthly gross income, used for projections. */
  estMonthlyIncome: number;
  /** planning estimate of monthly raw vendor expenses. */
  estMonthlyVendor: number;
}

/**
 * The shared, public org directory fetched from a static config.json. Managers
 * publish it; every device reads it without a login. See lib/config.ts.
 */
/**
 * A password that unlocks one or more tools for a scoped user/role — e.g. a
 * finance officer who may open a Payroll tool but nothing else. Same PBKDF2 +
 * AES-GCM verifier scheme as `pii`. NOTE: this is a client-side gate (a
 * deterrent), not real authentication — see lib/locks.ts / Tools.svelte.
 */
export interface ToolLock {
  /** Stable unique id. */
  id: string;
  /** Display name for the role/person, e.g. "Finance Officer". */
  label: string;
  /** Registry tool ids (filename without .svelte) this password unlocks. */
  tools: string[];
  /** PBKDF2 salt (public). */
  salt: string;
  /** Encrypted known-token to verify a typed password (see lib/crypto.ts). */
  verifier: string;
}

/** App-access config: the manager contact for access requests + tool locks. */
export interface AccessConfig {
  /** Manager email shown on the gate's "forgot password / request access". */
  managerEmail?: string;
  /** Per-tool password locks. */
  locks?: ToolLock[];
}

export interface OrgConfig {
  /** Bumped on every publish so clients can detect new info. */
  version: number;
  /** ISO timestamp of the last publish (display only). */
  updatedAt?: string;
  /**
   * True once a manager has published from this app at least once. Drives the
   * first-run setup screen: a fresh fork ships this false with no `pii`, so the
   * first person is prompted to sign in with a GitHub token and configure things.
   * A config that already has `pii` is treated as set up even if this is absent
   * (backward compatibility). See App.svelte.
   */
  setupComplete?: boolean;
  /**
   * PII encryption parameters. `salt` (public) seeds the PBKDF2 key derived from
   * the shared access password; `verifier` is an encrypted known-token used to
   * confirm a typed password is correct. Absent on configs with no protected
   * fields. See lib/crypto.ts + lib/access.ts.
   */
  pii?: { salt: string; verifier: string };
  company: CompanyInfo;
  employees: Employee[];
  /** Budget/wage policy (optional so older configs still parse). */
  finance?: FinanceConfig;
  /** Schedule template used for anyone without a specific assignment. */
  defaultTemplateId?: string;
  /** Company-wide days off. */
  holidays?: Holiday[];
  /**
   * One-off dated appointments / special days added to everyone's (or specific
   * employees') schedules. RUNTIME only — like schedules they're private, so at
   * rest they're encrypted into `eventsEnc` rather than published in plaintext;
   * config.ts decrypts them back into this field on unlock.
   */
  events?: CalendarEvent[];
  /**
   * AT-REST only: AES-GCM of JSON.stringify(events). Absent at runtime (config.ts
   * expands it back into `events` on unlock, and blanks both while locked).
   */
  eventsEnc?: string;
  /** Manager contact + per-tool password locks. */
  access?: AccessConfig;
  /**
   * Where this directory is published (owner/repo/path/branch). Saved so other
   * managers and devices prefill the publish target. Public info — the repo hosting
   * the config is world-readable anyway; the write token is never stored here.
   */
  publish?: { owner: string; repo: string; path: string; branch: string };
}

/** One month's actual income/expense entry, logged in the reporting tool. */
export interface MonthlyReport {
  id: string;
  /** "YYYY-MM" */
  month: string;
  /** gross business income for the month */
  income: number;
  /** raw vendor expenses for the month */
  vendor: number;
  note?: string;
}

export interface AppState {
  /**
   * Which employee this device belongs to (id into the org directory). Drives
   * which schedule template the Now screen shows. Undefined = use the company
   * default template.
   */
  myEmployeeId?: string;
  /** Optional personal off-hours / weekend schedule (used outside work hours). */
  personal: PersonalSchedule;
  /** Device-local one-off appointments the user adds (Settings → My appointments). */
  events: CalendarEvent[];
  days: Record<string, DayData>; // keyed "YYYY-MM-DD"
  settings: Settings;
  manage: ManageAuth;
  /** Device-local monthly income/expense log (management reporting tool). */
  reports: MonthlyReport[];
}
