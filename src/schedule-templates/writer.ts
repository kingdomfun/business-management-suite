import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "writer",
  name: "Writer / Copywriter",
  description: "Research, draft, edit, and ship copy",
  order: 19,
  blocks: [
    {
      time: "09:00",
      label: "Research & Brief",
      detail: "Review briefs · gather references",
      checklist: ["Briefs reviewed", "References gathered"],
    },
    { time: "10:00", label: "Drafting", detail: "Write the first draft — no editing", checklist: ["Outline set", "Draft written"] },
    { time: "11:00", label: "Drafting: Continuation", checklist: ["Sections completed", "Word count met"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Edit & Revise", detail: "Tighten copy · cut and sharpen", checklist: ["Revised", "Trimmed"] },
    { time: "14:00", label: "Proofread & Polish", checklist: ["Proofread", "Links checked"] },
    { time: "15:00", label: "Review & Feedback", detail: "Send for review · capture notes", checklist: ["Sent", "Notes captured"] },
    { time: "16:00", label: "Publish & Plan", checklist: ["Published", "Tomorrow planned"] },
  ],
};
