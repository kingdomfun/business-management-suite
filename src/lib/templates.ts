import type { AppState, Block, CalendarEvent, OrgConfig, PersonalSchedule, ScheduleTemplate } from "./types";
import { dateKey, eventBlock, eventsForDay, findHoliday, isOffHours, toMinutes } from "./schedule";

// The schedule template library. Each role lives in its own file under
// src/schedule-templates/ (like src/email-templates/) and exports a `template`
// object; dropping a new `.ts` there makes it appear everywhere automatically.

const modules = import.meta.glob("../schedule-templates/*.ts", { eager: true }) as Record<
  string,
  { template?: ScheduleTemplate; default?: ScheduleTemplate }
>;

/** The full built-in library, ordered by `order` then name. */
export const TEMPLATES: ScheduleTemplate[] = Object.values(modules)
  .map((m) => m.template ?? m.default)
  .filter((t): t is ScheduleTemplate => !!t)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));

/** Fallback template when nothing is assigned (first by order, else software). */
export const DEFAULT_TEMPLATE_ID = "software";

/** Id used for a manager-authored per-employee schedule. */
export const CUSTOM_TEMPLATE_ID = "custom";
/** Id used for the device's personal off-hours schedule. */
export const PERSONAL_TEMPLATE_ID = "personal";

/** Look up a template by id, falling back to the default. */
export function templateById(id?: string | null): ScheduleTemplate {
  return (
    TEMPLATES.find((t) => t.id === id) ??
    TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID) ??
    TEMPLATES[0]
  );
}

/** Wrap a bare block list as a one-off template (custom / personal schedules). */
function asTemplate(id: string, name: string, description: string, blocks: Block[]): ScheduleTemplate {
  return { id, name, description, blocks };
}

/** A "no schedule" template (e.g. on a company holiday) — no blocks, no alarms. */
export const EMPTY_TEMPLATE = asTemplate("none", "Day off", "No schedule today", []);

/**
 * The template assigned to an employee: their bespoke custom schedule if set,
 * else their assigned template, else the company default, else software.
 * (`||` not `??` so an empty-string assignment falls through to the default.)
 */
export function employeeTemplate(
  employee: { templateId?: string; customSchedule?: { blocks: Block[] } } | undefined,
  config: OrgConfig
): ScheduleTemplate {
  if (employee?.customSchedule?.blocks.length) {
    return asTemplate(CUSTOM_TEMPLATE_ID, "Custom schedule", "Set by management", employee.customSchedule.blocks);
  }
  return templateById(employee?.templateId || config.defaultTemplateId);
}

/**
 * Resolve which work template this device should show: the assigned template of
 * the employee this device belongs to, else the company default, else software.
 */
export function resolveTemplate(myEmployeeId: string | undefined, config: OrgConfig): ScheduleTemplate {
  const me = config.employees.find((e) => e.id === myEmployeeId);
  return employeeTemplate(me, config);
}

/** Build a one-off template from the device's personal off-hours schedule. */
export function personalTemplate(personal: PersonalSchedule): ScheduleTemplate {
  return asTemplate(PERSONAL_TEMPLATE_ID, "Personal (off-hours)", "Your off-hours routine", personal.blocks);
}

/**
 * The schedule actually in effect right now:
 *  - a company holiday → an empty "day off" template (no schedule, no alarms);
 *  - else, during off-hours/weekends with a personal schedule enabled → personal;
 *  - else → the device's work template.
 */
export function effectiveTemplate(state: AppState, config: OrgConfig, now: Date): ScheduleTemplate {
  if (findHoliday(config.holidays, dateKey(now))) return EMPTY_TEMPLATE;
  if (state.personal?.enabled && state.personal.blocks.length && isOffHours(now, state.settings.activeHours)) {
    return personalTemplate(state.personal);
  }
  return resolveTemplate(state.myEmployeeId, config);
}

// ---- Dated events overlay --------------------------------------------------

const byTime = (a: Block, b: Block) => toMinutes(a.time) - toMinutes(b.time);

/**
 * Overlay a date's events onto a base template. No events → the base unchanged.
 * If any applicable event marks the day as replaced → a one-off "special day"
 * template of just the event blocks; otherwise the events are merged in by time.
 */
export function withEvents(base: ScheduleTemplate, events: CalendarEvent[]): ScheduleTemplate {
  if (!events.length) return base;
  const eventBlocks = events.map(eventBlock);
  if (events.some((e) => e.replacesDay)) {
    return asTemplate("events", "Special day", "A one-off schedule for today", [...eventBlocks].sort(byTime));
  }
  return { ...base, blocks: [...base.blocks, ...eventBlocks].sort(byTime) };
}

/** The events applicable to this device on `now` (none on a company holiday). */
function dayEvents(state: AppState, config: OrgConfig, now: Date): CalendarEvent[] {
  if (findHoliday(config.holidays, dateKey(now))) return [];
  return eventsForDay(dateKey(now), state.myEmployeeId, config.events, state.events);
}

/** The schedule to SHOW now: the effective template with today's events overlaid. */
export function dayTemplate(state: AppState, config: OrgConfig, now: Date): ScheduleTemplate {
  return withEvents(effectiveTemplate(state, config, now), dayEvents(state, config, now));
}

/** The schedule the ALARM scheduler uses: the alarm template with events overlaid. */
export function alarmDayTemplate(state: AppState, config: OrgConfig, now: Date): ScheduleTemplate {
  return withEvents(alarmTemplate(state, config, now), dayEvents(state, config, now));
}

/**
 * The template the alarm scheduler should use. Same as effectiveTemplate, except
 * a *work* schedule fires no alarms until the device is tied to an employee
 * (Settings → Employee profile) — otherwise every device would chime on the
 * company-default schedule. Personal off-hours + holidays are unaffected.
 */
export function alarmTemplate(state: AppState, config: OrgConfig, now: Date): ScheduleTemplate {
  const t = effectiveTemplate(state, config, now);
  if (!state.myEmployeeId && t.id !== PERSONAL_TEMPLATE_ID) return EMPTY_TEMPLATE;
  return t;
}
