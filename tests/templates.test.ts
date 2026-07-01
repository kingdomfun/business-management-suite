import { describe, it, expect } from "vitest";
import {
  TEMPLATES,
  templateById,
  employeeTemplate,
  resolveTemplate,
  effectiveTemplate,
  alarmTemplate,
  personalTemplate,
  PERSONAL_TEMPLATE_ID,
  CUSTOM_TEMPLATE_ID,
} from "../src/lib/templates";
import { findHoliday, nowView } from "../src/lib/schedule";
import { defaultState } from "../src/lib/defaults";
import type { AppState, OrgConfig } from "../src/lib/types";

function cfg(over: Partial<OrgConfig> = {}): OrgConfig {
  return { version: 1, company: { name: "Co" }, employees: [], ...over };
}

// Saturday 2026-06-27 (off-hours) and a Monday 9:30 working hour.
const saturday = new Date("2026-06-27T12:00:00");
const monWork = new Date("2026-06-22T09:30:00");

describe("templates library", () => {
  it("has unique ids and required fields", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TEMPLATES) {
      expect(t.blocks.length).toBeGreaterThan(0);
      expect(t.name).toBeTruthy();
    }
  });

  it("only the software template has planning inputs on a block", () => {
    const withPlan = TEMPLATES.filter((t) => t.blocks.some((b) => b.plan?.length));
    expect(withPlan.map((t) => t.id)).toEqual(["software"]);
  });

  it("carries per-block checklists", () => {
    const sw = templateById("software");
    expect(sw.blocks.find((b) => b.time === "09:00")?.checklist).toContain("Objective set");
  });

  it("templateById falls back to the default for unknown ids", () => {
    expect(templateById("construction").id).toBe("construction");
    expect(templateById("nope").id).toBe("software");
    expect(templateById(undefined).id).toBe("software");
  });
});

describe("resolveTemplate", () => {
  it("uses the employee's own assignment first", () => {
    const config = cfg({
      defaultTemplateId: "office",
      employees: [{ id: "a", name: "A", role: "general", templateId: "landscaping" }],
    });
    expect(resolveTemplate("a", config).id).toBe("landscaping");
  });

  it("falls back to the company default when unassigned", () => {
    const config = cfg({
      defaultTemplateId: "childcare",
      employees: [{ id: "a", name: "A", role: "general" }],
    });
    expect(resolveTemplate("a", config).id).toBe("childcare");
    // Unknown device identity also lands on the company default.
    expect(resolveTemplate(undefined, config).id).toBe("childcare");
  });

  it("falls back to software with no default set", () => {
    expect(resolveTemplate(undefined, cfg()).id).toBe("software");
    expect(employeeTemplate(undefined, cfg()).id).toBe("software");
  });

  it("uses a per-employee custom schedule over any template", () => {
    const config = cfg({
      defaultTemplateId: "office",
      employees: [
        {
          id: "a",
          name: "A",
          role: "general",
          templateId: "landscaping",
          customSchedule: { blocks: [{ time: "08:00", label: "Open shop" }] },
        },
      ],
    });
    const t = resolveTemplate("a", config);
    expect(t.id).toBe(CUSTOM_TEMPLATE_ID);
    expect(t.blocks[0].label).toBe("Open shop");
  });
});

describe("effectiveTemplate", () => {
  function state(over: Partial<AppState> = {}): AppState {
    return { ...defaultState(), ...over };
  }

  it("shows the work template during work hours", () => {
    const s = state();
    s.personal.enabled = true;
    expect(effectiveTemplate(s, cfg({ defaultTemplateId: "office" }), monWork).id).toBe("office");
  });

  it("shows the personal schedule off-hours when enabled", () => {
    const s = state();
    s.personal.enabled = true;
    expect(effectiveTemplate(s, cfg(), saturday).id).toBe(PERSONAL_TEMPLATE_ID);
  });

  it("keeps the work template off-hours when personal is disabled", () => {
    const s = state();
    s.personal.enabled = false;
    expect(effectiveTemplate(s, cfg({ defaultTemplateId: "office" }), saturday).id).toBe("office");
  });

  it("shows an empty day-off template on a holiday", () => {
    const s = state();
    s.personal.enabled = true;
    const config = cfg({ holidays: [{ date: "2026-06-22", name: "Founders Day" }] });
    const t = effectiveTemplate(s, config, monWork);
    expect(t.blocks.length).toBe(0);
  });
});

describe("alarmTemplate", () => {
  function state(over: Partial<AppState> = {}): AppState {
    return { ...defaultState(), ...over };
  }
  const withMe = cfg({
    defaultTemplateId: "office",
    employees: [{ id: "e1", name: "Ada", role: "general" }],
  });

  it("fires no work-schedule alarms until an employee is selected", () => {
    const s = state(); // no myEmployeeId
    expect(alarmTemplate(s, withMe, monWork).blocks.length).toBe(0);
  });

  it("uses the work schedule once an employee is selected", () => {
    const s = state({ myEmployeeId: "e1" });
    expect(alarmTemplate(s, withMe, monWork).id).toBe("office");
  });

  it("still fires the personal off-hours schedule without an employee", () => {
    const s = state();
    s.personal.enabled = true;
    expect(alarmTemplate(s, cfg(), saturday).id).toBe(PERSONAL_TEMPLATE_ID);
  });
});

describe("default personal schedule", () => {
  const tpl = personalTemplate(defaultState().personal);
  const day = "2026-06-22";
  const at = (h: number, m = 0) =>
    new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

  it("reads as Sleep from 10 PM through 6 AM (across midnight)", () => {
    expect(nowView(tpl, defaultState(), at(23))!.label).toBe("Sleep");
    expect(nowView(tpl, defaultState(), at(2))!.label).toBe("Sleep");
    expect(nowView(tpl, defaultState(), at(5, 59))!.label).toBe("Sleep");
  });

  it("wakes to the morning routine at 6 AM (no leftover detail)", () => {
    const v = nowView(tpl, defaultState(), at(6, 30))!;
    expect(v.label).toBe("Morning Routine");
    expect(v.detail).toBe("");
  });

  it("ships a wake alarm, off by default at 6 AM", () => {
    const w = defaultState().personal.wakeAlarm;
    expect(w).toEqual({ enabled: false, time: "06:00" });
  });
});

describe("findHoliday", () => {
  const holidays = [
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-01-01", name: "New Year's Day" },
  ];
  it("matches an exact date", () => {
    expect(findHoliday(holidays, "2026-12-25")?.name).toBe("Christmas Day");
  });
  it("returns undefined on a normal day or empty list", () => {
    expect(findHoliday(holidays, "2026-06-22")).toBeUndefined();
    expect(findHoliday(undefined, "2026-12-25")).toBeUndefined();
  });
});
