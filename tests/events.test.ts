import { describe, it, expect } from "vitest";
import { eventsForDay, eventBlock, nowView } from "../src/lib/schedule";
import { withEvents, dayTemplate, alarmDayTemplate, templateById, EMPTY_TEMPLATE } from "../src/lib/templates";
import { defaultState } from "../src/lib/defaults";
import type { AppState, CalendarEvent, OrgConfig } from "../src/lib/types";

function cfg(over: Partial<OrgConfig> = {}): OrgConfig {
  return { version: 1, company: { name: "Co" }, employees: [], ...over };
}
function state(over: Partial<AppState> = {}): AppState {
  return { ...defaultState(), ...over };
}

const day = "2026-07-15"; // a Wednesday
const at = (h: number, m = 0) =>
  new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

const call1pm: CalendarEvent = { id: "c1", date: day, time: "13:00", label: "Call client" };

describe("eventsForDay", () => {
  it("matches company events on the date that target everyone", () => {
    const evs = eventsForDay(day, undefined, [call1pm], undefined);
    expect(evs.map((e) => e.id)).toEqual(["c1"]);
  });

  it("ignores events on other dates", () => {
    expect(eventsForDay("2026-07-16", undefined, [call1pm], undefined)).toEqual([]);
  });

  it("applies a targeted company event only to its employees", () => {
    const targeted: CalendarEvent = { ...call1pm, employeeIds: ["e1"] };
    expect(eventsForDay(day, "e1", [targeted], undefined)).toHaveLength(1);
    expect(eventsForDay(day, "e2", [targeted], undefined)).toHaveLength(0);
    expect(eventsForDay(day, undefined, [targeted], undefined)).toHaveLength(0);
  });

  it("always includes personal events on the date", () => {
    const personal: CalendarEvent = { id: "p1", date: day, time: "18:00", label: "Dentist" };
    const evs = eventsForDay(day, undefined, undefined, [personal]);
    expect(evs.map((e) => e.id)).toEqual(["p1"]);
  });

  it("returns company + personal sorted by time", () => {
    const personal: CalendarEvent = { id: "p1", date: day, time: "08:00", label: "Gym" };
    const evs = eventsForDay(day, undefined, [call1pm], [personal]);
    expect(evs.map((e) => e.id)).toEqual(["p1", "c1"]); // 08:00 before 13:00
  });
});

describe("eventBlock", () => {
  it("marks the block as an event and carries the detail", () => {
    const b = eventBlock({ id: "x", date: day, time: "13:00", label: "Call", detail: "Acme" });
    expect(b).toEqual({ time: "13:00", label: "Call", event: true, detail: "Acme" });
  });
});

describe("withEvents", () => {
  const base = templateById("software");

  it("returns the base unchanged with no events", () => {
    expect(withEvents(base, [])).toBe(base);
  });

  it("overlays events onto the base, sorted by time", () => {
    const t = withEvents(base, [call1pm]);
    expect(t.id).toBe("software");
    const times = t.blocks.map((b) => b.time);
    expect(times).toEqual([...times].sort());
    expect(t.blocks.find((b) => b.event && b.label === "Call client")).toBeTruthy();
  });

  it("replaces the whole day when an event is flagged replacesDay", () => {
    const special: CalendarEvent = { ...call1pm, replacesDay: true };
    const t = withEvents(base, [special, { id: "c2", date: day, time: "09:00", label: "Kickoff" }]);
    expect(t.id).toBe("events");
    expect(t.blocks.map((b) => b.label)).toEqual(["Kickoff", "Call client"]);
  });
});

describe("dayTemplate", () => {
  it("overlays a company appointment onto the resolved work schedule", () => {
    const config = cfg({
      defaultTemplateId: "office",
      employees: [{ id: "e1", name: "Ada", role: "general" }],
      events: [call1pm],
    });
    const s = state({ myEmployeeId: "e1" });
    const t = dayTemplate(s, config, at(10));
    expect(t.blocks.some((b) => b.event && b.label === "Call client")).toBe(true);
  });

  it("surfaces the appointment as the active block and flags isEvent", () => {
    const config = cfg({
      defaultTemplateId: "office",
      employees: [{ id: "e1", name: "Ada", role: "general" }],
      events: [call1pm],
    });
    const s = state({ myEmployeeId: "e1" });
    const t = dayTemplate(s, config, at(13, 30));
    const v = nowView(t, s, at(13, 30))!;
    expect(v.label).toBe("Call client");
    expect(v.isEvent).toBe(true);
  });

  it("overlays personal appointments with no employee identity", () => {
    const s = state({ events: [{ id: "p1", date: day, time: "13:00", label: "School run" }] });
    const t = dayTemplate(s, cfg(), at(13, 30));
    const v = nowView(t, s, at(13, 30))!;
    expect(v.label).toBe("School run");
    expect(v.isEvent).toBe(true);
  });

  it("drops events on a company holiday (the day off wins)", () => {
    const config = cfg({ holidays: [{ date: day, name: "Founders Day" }], events: [call1pm] });
    const s = state({ myEmployeeId: "e1" });
    const t = dayTemplate(s, config, at(13, 30));
    expect(t.blocks.length).toBe(0);
    expect(t.id).toBe(EMPTY_TEMPLATE.id);
  });
});

describe("alarmDayTemplate", () => {
  it("adds an appointment even before an employee identity is set", () => {
    // Work schedule alone stays silent until identified, but an explicit
    // company-wide appointment should still chime.
    const config = cfg({ defaultTemplateId: "office", events: [call1pm] });
    const s = state(); // no myEmployeeId
    const t = alarmDayTemplate(s, config, at(10));
    expect(t.blocks.some((b) => b.label === "Call client")).toBe(true);
  });
});
