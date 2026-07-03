import { describe, it, expect } from "vitest";
import { allowanceFor, leaveUsage } from "../src/lib/leave";
import type { CalendarEvent, Employee } from "../src/lib/types";

const alice: Employee = {
  id: "a",
  name: "Alice",
  role: "general",
  sickAllowance: 10,
  holidayAllowance: 20,
};
const bob: Employee = { id: "b", name: "Bob", role: "general", holidayAllowance: 15 };

function ev(part: Partial<CalendarEvent> & Pick<CalendarEvent, "date">): CalendarEvent {
  return { id: part.date + (part.leaveType ?? "") + (part.time ?? ""), time: "09:00", label: "Off", ...part };
}

describe("allowanceFor", () => {
  it("returns the configured allowance, rounded", () => {
    expect(allowanceFor(alice, "sick")).toBe(10);
    expect(allowanceFor(alice, "holiday")).toBe(20);
  });
  it("treats absent / zero / negative as no allowance", () => {
    expect(allowanceFor(bob, "sick")).toBe(0);
    expect(allowanceFor({ ...bob, holidayAllowance: 0 }, "holiday")).toBe(0);
    expect(allowanceFor({ ...bob, holidayAllowance: -3 }, "holiday")).toBe(0);
  });
});

describe("leaveUsage", () => {
  const events: CalendarEvent[] = [
    ev({ date: "2026-02-01", leaveType: "sick", employeeIds: ["a"] }),
    ev({ date: "2026-02-02", leaveType: "sick", employeeIds: ["a"] }),
    ev({ date: "2026-03-10", leaveType: "holiday", employeeIds: ["a"] }),
    // Same-day second event must NOT double-count.
    ev({ date: "2026-02-01", leaveType: "sick", employeeIds: ["a"], time: "14:00" }),
    // Targets a different employee.
    ev({ date: "2026-04-01", leaveType: "sick", employeeIds: ["b"] }),
    // Company-wide (no employeeIds) leave is ignored — that's a Holiday.
    ev({ date: "2026-05-01", leaveType: "holiday", employeeIds: [] }),
    // Untagged appointment doesn't consume allowance.
    ev({ date: "2026-06-01", employeeIds: ["a"] }),
    // Different year.
    ev({ date: "2025-02-01", leaveType: "sick", employeeIds: ["a"] }),
  ];

  it("counts distinct dates for the employee, type and year", () => {
    const sick = leaveUsage(alice, events, "sick", "2026");
    expect(sick).toEqual({ allotted: 10, used: 2, remaining: 8 });
  });

  it("tallies holiday separately", () => {
    expect(leaveUsage(alice, events, "holiday", "2026")).toEqual({ allotted: 20, used: 1, remaining: 19 });
  });

  it("scopes to the given year", () => {
    expect(leaveUsage(alice, events, "sick", "2025").used).toBe(1);
  });

  it("only counts events targeting the employee", () => {
    expect(leaveUsage(bob, events, "sick", "2026").used).toBe(1);
  });

  it("remaining goes negative when booked past the allowance", () => {
    const overbooked = [
      ev({ date: "2026-01-01", leaveType: "sick", employeeIds: ["b"] }),
    ];
    expect(leaveUsage({ ...bob, sickAllowance: 0 }, overbooked, "sick", "2026").remaining).toBe(-1);
  });

  it("handles no events", () => {
    expect(leaveUsage(alice, undefined, "sick", "2026")).toEqual({ allotted: 10, used: 0, remaining: 10 });
  });
});
