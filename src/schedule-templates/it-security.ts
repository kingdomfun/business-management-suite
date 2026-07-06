import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "it-security",
  name: "IT Security",
  description: "Monitor threats, patch, respond, and harden",
  order: 18,
  blocks: [
    {
      time: "09:00",
      label: "Threat Monitoring & Priorities",
      detail: "Review alerts · check overnight events",
      checklist: ["Alerts reviewed", "Priorities set"],
    },
    { time: "10:00", label: "Vulnerability & Patch Review", detail: "Triage findings · schedule patches", checklist: ["Findings triaged", "Patches scheduled"] },
    { time: "11:00", label: "Incident Response", detail: "Investigate and contain any issues", checklist: ["Incidents reviewed", "Containment set"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Access & Identity Review", checklist: ["Access reviewed", "Anomalies flagged"] },
    { time: "14:00", label: "Hardening & Config", detail: "Apply controls · tune defenses", checklist: ["Controls applied", "Configs verified"] },
    { time: "15:00", label: "Awareness & Advisory", checklist: ["Questions answered", "Guidance shared"] },
    { time: "16:00", label: "Report & Plan", checklist: ["Status reported", "Tomorrow planned"] },
  ],
};
