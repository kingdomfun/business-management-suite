import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "marketer",
  name: "Marketer",
  description: "Campaigns, content, analytics, and optimization",
  order: 10,
  blocks: [
    {
      time: "09:00",
      label: "Metrics & Priorities",
      detail: "Check dashboards · set the day's focus",
      checklist: ["Dashboards reviewed", "Priorities set"],
    },
    { time: "10:00", label: "Campaign Work", detail: "Build or refine an active campaign", checklist: ["Assets prepped", "Targeting set"] },
    { time: "11:00", label: "Content & Copy", checklist: ["Drafted", "Reviewed", "Approved"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Channels & Outreach", detail: "Email · ads · partnerships", checklist: ["Sends queued", "Follow-ups sent"] },
    { time: "14:00", label: "Analytics & Optimization", checklist: ["Results analyzed", "Tests adjusted"] },
    { time: "16:00", label: "Report & Plan", checklist: ["Updates logged", "Tomorrow planned"] },
  ],
};
