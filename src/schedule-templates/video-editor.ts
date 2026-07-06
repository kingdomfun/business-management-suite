import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "video-editor",
  name: "Video Editor",
  description: "Ingest, cut, review, and export the day's edits",
  order: 8,
  blocks: [
    {
      time: "09:00",
      label: "Ingest & Organize",
      detail: "Import footage · back up · sync audio",
      checklist: ["Footage imported", "Backed up", "Audio synced"],
    },
    { time: "10:00", label: "Rough Cut", detail: "Assemble selects into a timeline", checklist: ["Selects pulled", "Story assembled"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Fine Cut & Pacing", checklist: ["Timing tightened", "Transitions set"] },
    { time: "14:00", label: "Color, Sound & Graphics", checklist: ["Graded", "Mixed", "Titles added"] },
    { time: "15:00", label: "Client Review", detail: "Watch through · capture notes", checklist: ["Reviewed", "Notes captured"] },
    { time: "16:00", label: "Export & Deliver", checklist: ["Rendered", "QC'd", "Delivered"] },
  ],
};
