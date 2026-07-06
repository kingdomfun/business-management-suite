import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "product-designer",
  name: "Product Designer",
  description: "Research, ideate, design, and hand off to build",
  order: 13,
  blocks: [
    {
      time: "09:00",
      label: "Research & Priorities",
      detail: "Review feedback · set design goals",
      checklist: ["Feedback reviewed", "Goals set"],
    },
    { time: "10:00", label: "Ideation & Sketching", detail: "Explore flows and concepts", checklist: ["Flows mapped", "Concepts sketched"] },
    { time: "11:00", label: "Design & Prototype", checklist: ["Screens designed", "Prototype linked"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Critique & Feedback", detail: "Present work · capture notes", checklist: ["Presented", "Notes captured"] },
    { time: "14:00", label: "Iterate & Refine", checklist: ["Revisions made", "Polished"] },
    { time: "15:00", label: "Handoff & Specs", detail: "Prep assets and specs for engineering", checklist: ["Assets exported", "Specs written"] },
    { time: "16:00", label: "Wrap-up & Plan", checklist: ["Files organized", "Tomorrow planned"] },
  ],
};
