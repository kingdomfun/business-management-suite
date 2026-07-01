import type { Employee, WorkerRole } from "./types";

// Display metadata + ordering for the HR directory.

export const ROLE_ORDER: WorkerRole[] = ["manager", "senior", "general"];

export const ROLE_LABEL: Record<WorkerRole, string> = {
  manager: "Manager",
  senior: "Senior staff",
  general: "General staff",
};

const rank: Record<WorkerRole, number> = { manager: 0, senior: 1, general: 2 };

/** The owner (seed employee id "owner") always sorts first, above other managers. */
function ownerFirst(e: Employee): number {
  return e.id === "owner" ? -1 : 0;
}

/**
 * Employees sorted owner → managers → senior ("veterans") → general ("standard"),
 * then alphabetically by name.
 */
export function sortWorkers(employees: Employee[]): Employee[] {
  return [...employees].sort(
    (a, b) =>
      ownerFirst(a) - ownerFirst(b) ||
      rank[a.role] - rank[b.role] ||
      a.name.localeCompare(b.name)
  );
}
