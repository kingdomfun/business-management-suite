import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "social-media",
  name: "Social Media Manager",
  description: "Engage, create, schedule, and report on channels",
  order: 9,
  blocks: [
    {
      time: "09:00",
      label: "Community & Inbox",
      detail: "Reply to comments and DMs · monitor mentions",
      checklist: ["Comments replied", "DMs cleared", "Mentions checked"],
    },
    { time: "10:00", label: "Content Creation", detail: "Draft posts · edit visuals · write captions", checklist: ["Copy drafted", "Visuals ready"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Schedule & Publish", checklist: ["Queue filled", "Hashtags set", "Scheduled"] },
    { time: "14:00", label: "Trends & Ideation", detail: "Scan trends · plan upcoming content", checklist: ["Trends reviewed", "Ideas logged"] },
    { time: "15:00", label: "Analytics Review", checklist: ["Metrics pulled", "Top posts noted"] },
    { time: "16:00", label: "Wrap-up & Plan", checklist: ["Calendar updated", "Tomorrow planned"] },
  ],
};
