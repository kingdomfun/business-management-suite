import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "director",
  name: "Director",
  description: "Set direction, review, decide, and lead the team",
  order: 14,
  blocks: [
    {
      time: "09:00",
      label: "Priorities & Vision",
      detail: "Review goals · set the day's direction",
      checklist: ["Goals reviewed", "Direction set"],
    },
    { time: "09:30", label: "Leadership Sync", detail: "Align with leads on progress and blockers", checklist: ["Aligned", "Blockers surfaced"] },
    { time: "10:30", label: "Reviews & Decisions", detail: "Review work · make calls", checklist: ["Reviewed", "Decisions made"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "1:1s & Coaching", checklist: ["Met with reports", "Feedback given"] },
    { time: "14:00", label: "Strategy & Planning", detail: "Roadmap · budget · hiring", checklist: ["Roadmap advanced", "Decisions logged"] },
    { time: "15:00", label: "Stakeholder & External", checklist: ["Updates shared", "Follow-ups sent"] },
    { time: "16:00", label: "Reflect & Plan", checklist: ["Day reviewed", "Tomorrow planned"] },
  ],
};
