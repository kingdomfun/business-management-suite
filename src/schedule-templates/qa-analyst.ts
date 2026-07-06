import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "qa-analyst",
  name: "QA Analyst",
  description: "Plan, test, log defects, and verify fixes",
  order: 16,
  blocks: [
    {
      time: "09:00",
      label: "Triage & Priorities",
      detail: "Review builds · pick test targets",
      checklist: ["Builds reviewed", "Priorities set"],
    },
    { time: "10:00", label: "Test Case Design", detail: "Write and update test cases", checklist: ["Cases written", "Coverage checked"] },
    { time: "11:00", label: "Test Execution", detail: "Run manual and automated tests", checklist: ["Tests run", "Results recorded"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Defect Logging", detail: "Reproduce · document · file bugs", checklist: ["Defects logged", "Steps documented"] },
    { time: "14:00", label: "Regression & Verification", checklist: ["Fixes verified", "Regression run"] },
    { time: "15:00", label: "Automation & Maintenance", checklist: ["Scripts updated", "Flaky tests noted"] },
    { time: "16:00", label: "Report & Plan", checklist: ["Status reported", "Tomorrow planned"] },
  ],
};
