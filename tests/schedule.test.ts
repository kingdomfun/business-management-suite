import { describe, it, expect } from "vitest";
import { defaultState } from "../src/lib/defaults";
import { templateById } from "../src/lib/templates";
import {
  currentBlock,
  nowView,
  alarmTimesFor,
  toMinutes,
  normLabel,
  dateKey,
  formatTime,
  isOffHours,
  nextDay,
} from "../src/lib/schedule";
import type { Block } from "../src/lib/types";

// The software-engineer template is the original schedule the tests cover.
const tpl = templateById("software");

const blocks: Block[] = [
  { time: "09:00", label: "Deep Work: Primary Task" },
  { time: "12:00", label: "Lunch / Meeting / Feedback" },
  { time: "16:00", label: "Plan for Tomorrow & Shutdown" },
];

// Build a Date for a given date + hour/min. 2026-06-22 is a Monday.
function at(dateISO: string, h: number, m = 0): Date {
  return new Date(`${dateISO}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
}

describe("formatTime", () => {
  it("renders 12-hour clock with AM/PM", () => {
    expect(formatTime("09:00")).toBe("9:00 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("13:00")).toBe("1:00 PM");
    expect(formatTime("16:00")).toBe("4:00 PM");
    expect(formatTime("00:30")).toBe("12:30 AM");
  });
});

describe("currentBlock", () => {
  it("returns null before the first block", () => {
    expect(currentBlock(blocks, at("2026-06-22", 8, 30))).toBeNull();
  });

  it("selects the active block at its boundary", () => {
    const c = currentBlock(blocks, at("2026-06-22", 12, 0));
    expect(c?.block.label).toBe("Lunch / Meeting / Feedback");
    expect(c?.next?.label).toBe("Plan for Tomorrow & Shutdown");
  });

  it("selects the active block mid-interval", () => {
    const c = currentBlock(blocks, at("2026-06-22", 10, 0));
    expect(c?.block.label).toBe("Deep Work: Primary Task");
    expect(c?.endsInMin).toBe(120); // until 12:00
  });

  it("runs the final block until midnight", () => {
    const c = currentBlock(blocks, at("2026-06-22", 23, 0));
    expect(c?.block.label).toBe("Plan for Tomorrow & Shutdown");
    expect(c?.next).toBeNull();
    expect(c?.endsInMin).toBe(60);
  });

  it("is unaffected by input ordering", () => {
    const shuffled = [blocks[2], blocks[0], blocks[1]];
    const c = currentBlock(shuffled, at("2026-06-22", 12, 30));
    expect(c?.block.label).toBe("Lunch / Meeting / Feedback");
  });
});

describe("currentBlock end-of-day cap", () => {
  // blocks[] ends with the 16:00 "Plan for Tomorrow & Shutdown" block.
  it("counts the final block down to the work-day end, not midnight", () => {
    const c = currentBlock(blocks, at("2026-06-22", 16, 15), 17 * 60);
    expect(c?.block.label).toBe("Plan for Tomorrow & Shutdown");
    expect(c?.endsInMin).toBe(45); // 16:15 → 17:00, not → midnight
  });

  it("treats time past the work-day end as no active block", () => {
    expect(currentBlock(blocks, at("2026-06-22", 17, 30), 17 * 60)).toBeNull();
  });

  it("still runs the final block to midnight with no cap", () => {
    const c = currentBlock(blocks, at("2026-06-22", 17, 30));
    expect(c?.block.label).toBe("Plan for Tomorrow & Shutdown");
    expect(c?.endsInMin).toBe(390); // 17:30 → midnight
  });

  it("ignores a cap at/before the final block's start (keeps it visible)", () => {
    const c = currentBlock(blocks, at("2026-06-22", 16, 30), 16 * 60);
    expect(c?.block.label).toBe("Plan for Tomorrow & Shutdown");
    expect(c?.endsInMin).toBe(450); // falls back to midnight
  });

  it("does not affect a non-final block", () => {
    const c = currentBlock(blocks, at("2026-06-22", 10, 0), 17 * 60);
    expect(c?.block.label).toBe("Deep Work: Primary Task");
    expect(c?.endsInMin).toBe(120); // still bounded by the next block at 12:00
  });
});

describe("nowView", () => {
  it("composes the headline and overlays a task note", () => {
    const s = defaultState();
    const dk = dateKey(at("2026-06-22", 9));
    s.days[dk] = { blocks: { "09:00": { taskNote: "Ship plugin" } } };
    const v = nowView(tpl, s, at("2026-06-22", 9, 15))!;
    expect(v.headline).toBe("Deep Work: Primary Task — Ship plugin");
    expect(v.taskNote).toBe("Ship plugin");
    expect(v.detail).toBe("Work on hardest task");
  });

  it("omits the task when none is set", () => {
    const s = defaultState();
    const v = nowView(tpl, s, at("2026-06-22", 9, 15))!;
    expect(v.headline).toBe("Deep Work: Primary Task");
  });

  it("flags the 4 PM block as the planning block", () => {
    const s = defaultState();
    expect(nowView(tpl, s, at("2026-06-22", 9, 15))!.isPlan).toBe(false);
    expect(nowView(tpl, s, at("2026-06-22", 16, 15))!.isPlan).toBe(true);
  });

  it("exposes the checklist template for the block", () => {
    const s = defaultState();
    const v = nowView(tpl, s, at("2026-06-22", 9, 30))!; // primary task
    expect(v.checklist.map((c) => c.step)).toContain("Objective set");
    expect(v.checklist.every((c) => !c.done)).toBe(true);
  });

  it("reflects checked steps", () => {
    const s = defaultState();
    const dk = dateKey(at("2026-06-22", 9));
    s.days[dk] = { blocks: { "09:00": { checklist: { Prayed: true } } } };
    const v = nowView(tpl, s, at("2026-06-22", 9, 30))!;
    expect(v.checklist.find((c) => c.step === "Prayed")?.done).toBe(true);
  });
});

describe("next-day planning", () => {
  it("nextDay advances by one calendar day", () => {
    expect(dateKey(nextDay(at("2026-06-22", 16)))).toBe("2026-06-23");
  });
});

describe("isOffHours", () => {
  const hours = { start: 9, end: 17 };
  it("is true on weekends at any hour", () => {
    expect(isOffHours(at("2026-06-27", 12), hours)).toBe(true); // Saturday
    expect(isOffHours(at("2026-06-28", 12), hours)).toBe(true); // Sunday
  });
  it("is true before/after work hours on a weekday", () => {
    expect(isOffHours(at("2026-06-22", 7), hours)).toBe(true); // before 9
    expect(isOffHours(at("2026-06-22", 18), hours)).toBe(true); // after 17
  });
  it("is false during work hours on a weekday", () => {
    expect(isOffHours(at("2026-06-22", 9), hours)).toBe(false);
    expect(isOffHours(at("2026-06-22", 16, 59), hours)).toBe(false);
  });
});

describe("alarmTimesFor", () => {
  it("keeps only boundaries inside active hours", () => {
    const s = defaultState(); // active 9..16
    const times = alarmTimesFor(tpl, s);
    expect(times[0]).toBe(toMinutes("09:00"));
    expect(times.at(-1)).toBe(toMinutes("16:00"));
    expect(times).not.toContain(toMinutes("17:00"));
  });
});

describe("helpers", () => {
  it("normLabel is stable", () => {
    expect(normLabel("  Deep   Work ")).toBe("deep work");
  });
  it("dateKey has no UTC shift", () => {
    expect(dateKey(at("2026-06-22", 0, 30))).toBe("2026-06-22");
  });
});
