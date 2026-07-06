import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "project-manager",
  name: "Project Manager",
  description: "Standup, unblock, track, and coordinate delivery",
  order: 12,
  blocks: [
    {
      time: "09:00",
      label: "Standup & Priorities",
      detail: "Review board · set the day's focus",
      checklist: ["Board reviewed", "Priorities set"],
    },
    { time: "09:30", label: "Unblock the Team", detail: "Clear blockers · answer questions", checklist: ["Blockers cleared", "Questions answered"] },
    { time: "10:00", label: "Stakeholder Sync", checklist: ["Status shared", "Risks flagged"] },
    { time: "11:00", label: "Planning & Tracking", detail: "Update timelines · groom backlog", checklist: ["Timeline updated", "Backlog groomed"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Coordination & Reviews", checklist: ["Reviews held", "Decisions logged"] },
    { time: "15:00", label: "Risk & Scope Check", checklist: ["Risks reviewed", "Scope confirmed"] },
    { time: "16:00", label: "Report & Plan", checklist: ["Status updated", "Tomorrow planned"] },
  ],
};
