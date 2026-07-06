import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "compliance-officer",
  name: "Compliance Officer",
  description: "Monitor, review, audit, and document compliance",
  order: 17,
  blocks: [
    {
      time: "09:00",
      label: "Regulatory Review & Priorities",
      detail: "Scan updates · set the day's focus",
      checklist: ["Updates reviewed", "Priorities set"],
    },
    { time: "10:00", label: "Policy & Controls Review", detail: "Check policies against requirements", checklist: ["Policies reviewed", "Gaps noted"] },
    { time: "11:00", label: "Monitoring & Screening", checklist: ["Alerts triaged", "Cases reviewed"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Audits & Investigations", detail: "Review evidence · follow up on issues", checklist: ["Evidence reviewed", "Findings logged"] },
    { time: "14:00", label: "Training & Advisory", checklist: ["Questions answered", "Guidance given"] },
    { time: "15:00", label: "Documentation & Reporting", detail: "Update records · draft reports", checklist: ["Records updated", "Reports drafted"] },
    { time: "16:00", label: "Wrap-up & Plan", checklist: ["Actions logged", "Tomorrow planned"] },
  ],
};
