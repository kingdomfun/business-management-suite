import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "customer-support",
  name: "Customer Support Agent",
  description: "Work the queue, resolve tickets, and escalate",
  order: 22,
  blocks: [
    {
      time: "09:00",
      label: "Queue & Priorities",
      detail: "Review overnight tickets · set focus",
      checklist: ["Queue reviewed", "Priorities set"],
    },
    { time: "09:30", label: "Ticket Queue", detail: "Respond and resolve tickets", checklist: ["Tickets answered", "Resolved logged"] },
    { time: "11:00", label: "Escalations & Follow-ups", checklist: ["Escalations filed", "Follow-ups sent"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Ticket Queue", detail: "Respond and resolve tickets", checklist: ["Tickets answered", "Resolved logged"] },
    { time: "15:00", label: "Knowledge Base & Feedback", detail: "Update docs · flag recurring issues", checklist: ["Docs updated", "Trends flagged"] },
    { time: "16:00", label: "Wrap-up & Handoff", checklist: ["Open tickets noted", "Handoff written"] },
  ],
};
