import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "recruiter",
  name: "Recruiter",
  description: "Source, screen, interview, and coordinate hires",
  order: 21,
  blocks: [
    {
      time: "09:00",
      label: "Pipeline & Priorities",
      detail: "Review reqs · check candidate stages",
      checklist: ["Reqs reviewed", "Priorities set"],
    },
    { time: "10:00", label: "Sourcing & Outreach", detail: "Find and message candidates", checklist: ["Candidates sourced", "Messages sent"] },
    { time: "11:00", label: "Screening Calls", checklist: ["Calls held", "Notes logged"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Interviews & Debriefs", detail: "Run interviews · sync with panel", checklist: ["Interviews done", "Debriefs held"] },
    { time: "14:00", label: "Coordination & Scheduling", checklist: ["Interviews scheduled", "Follow-ups sent"] },
    { time: "15:00", label: "Offers & Hiring Managers", detail: "Advance candidates · align on decisions", checklist: ["Statuses updated", "Managers synced"] },
    { time: "16:00", label: "Update ATS & Plan", checklist: ["ATS updated", "Tomorrow planned"] },
  ],
};
