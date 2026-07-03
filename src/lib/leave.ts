import type { CalendarEvent, Employee } from "./types";

// Pure leave/time-off accounting — no DOM, no storage — so it is unit-testable.
// Allowances are set per employee (Employee.sickAllowance / holidayAllowance);
// "used" days are derived from dated leave events on the company calendar
// (CalendarEvent.leaveType), never stored. This mirrors the codebase's
// "derive, don't store" style (cf. finance reserves).

/** The kinds of time off tracked against a per-employee yearly allowance. */
export const LEAVE_TYPES = [
  { key: "sick", label: "Sick" },
  { key: "holiday", label: "Holiday" },
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number]["key"];

/** The yearly allowance a manager set for one leave type, in whole days (0 if none). */
export function allowanceFor(employee: Employee, type: LeaveType): number {
  const v = type === "sick" ? employee.sickAllowance : employee.holidayAllowance;
  return v && v > 0 ? Math.round(v) : 0;
}

export interface LeaveTally {
  /** allowance for the year */
  allotted: number;
  /** distinct calendar days taken */
  used: number;
  /** allotted - used (can go negative if booked past the allowance) */
  remaining: number;
}

/**
 * Tally one employee's leave of a given type for a calendar year ("YYYY"). Counts
 * the DISTINCT dates they're booked off — several events on one day still count as
 * a single day. Only leave events that explicitly target the employee are counted
 * (a company-wide day off is a Holiday, not personal leave).
 */
export function leaveUsage(
  employee: Employee,
  events: CalendarEvent[] | undefined,
  type: LeaveType,
  year: string
): LeaveTally {
  const days = new Set<string>();
  for (const e of events ?? []) {
    if (e.leaveType !== type) continue;
    if (!e.employeeIds?.includes(employee.id)) continue;
    if (!e.date.startsWith(year + "-")) continue;
    days.add(e.date);
  }
  const allotted = allowanceFor(employee, type);
  return { allotted, used: days.size, remaining: allotted - days.size };
}
