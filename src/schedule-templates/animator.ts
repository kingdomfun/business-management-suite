import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "animator",
  name: "Animator",
  description: "Blocking, animation passes, review, and render",
  order: 11,
  blocks: [
    {
      time: "09:00",
      label: "Warm-up & Shot Plan",
      detail: "Review references · plan today's shots",
      checklist: ["References reviewed", "Shots planned"],
    },
    { time: "10:00", label: "Blocking", detail: "Key poses and staging", checklist: ["Keys posed", "Staging set"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Animation Pass", detail: "Splining · breakdowns · timing", checklist: ["Splined", "Timing refined"] },
    { time: "15:00", label: "Polish", checklist: ["Arcs cleaned", "Overlap added"] },
    { time: "15:30", label: "Dailies / Review", detail: "Present shots · capture notes", checklist: ["Presented", "Notes captured"] },
    { time: "16:00", label: "Render & Wrap", checklist: ["Playblast rendered", "Files saved", "Tomorrow planned"] },
  ],
};
