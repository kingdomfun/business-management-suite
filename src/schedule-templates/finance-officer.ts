import type { ScheduleTemplate } from "../lib/types";

export const template: ScheduleTemplate = {
  id: "finance-officer",
  name: "Finance Officer",
  description: "Reconcile, report, review, and forecast",
  order: 15,
  blocks: [
    {
      time: "09:00",
      label: "Cash & Priorities",
      detail: "Review balances · set the day's focus",
      checklist: ["Balances reviewed", "Priorities set"],
    },
    { time: "10:00", label: "Reconciliation", detail: "Match transactions · clear exceptions", checklist: ["Accounts reconciled", "Exceptions cleared"] },
    { time: "11:00", label: "Payables & Receivables", checklist: ["Invoices processed", "Payments scheduled"] },
    { time: "12:00", label: "Lunch" },
    { time: "13:00", label: "Reporting & Analysis", detail: "Build statements · review variances", checklist: ["Reports built", "Variances noted"] },
    { time: "14:00", label: "Budget & Forecast", checklist: ["Forecast updated", "Assumptions checked"] },
    { time: "15:00", label: "Compliance & Approvals", detail: "Review controls · approve items", checklist: ["Controls reviewed", "Items approved"] },
    { time: "16:00", label: "Wrap-up & Plan", checklist: ["Ledgers closed", "Tomorrow planned"] },
  ],
};
