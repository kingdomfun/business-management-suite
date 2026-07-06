import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "music-producer",
  name: "Music Producer",
  description: "Write, record, mix, and deliver tracks",
  order: 20,
  blocks: [
    {
      time: "10:00",
      label: "Setup & Session Plan",
      detail: "Review references · plan the session",
      checklist: ["References reviewed", "Session planned"],
    },
    { time: "11:00", label: "Writing & Arrangement", detail: "Build ideas · arrange the track", checklist: ["Ideas laid down", "Arrangement set"] },
    { time: "13:00", label: "Lunch" },
    { time: "14:00", label: "Recording & Tracking", detail: "Cut takes · comp performances", checklist: ["Takes recorded", "Comped"] },
    { time: "16:00", label: "Editing & Sound Design", checklist: ["Edited", "Sounds designed"] },
    { time: "17:00", label: "Mixing", detail: "Balance · EQ · effects", checklist: ["Balanced", "Processed"] },
    { time: "18:00", label: "Bounce & Deliver", checklist: ["Bounced", "Backed up", "Delivered"] },
  ],
};
