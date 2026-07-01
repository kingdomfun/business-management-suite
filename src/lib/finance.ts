import type { Employee, FinanceConfig, MonthlyReport, WorkerRole } from "./types";

// Pure budget math for the Business tab + reporting tool. The model mirrors the
// company's published breakdown:
//
//   100% Gross income
//     └─ Step 1: minus a tax reserve (% of gross) and raw vendor expenses
//          └─ Post-tax revenue pool
//               ├─ Step 2: internal reserves (each a % of the post-tax pool)
//               └─ Step 3: worker wage pool (the remainder), distributed to
//                          labour weighted by role multiplier (mgmt capped 2x).
//
// Everything here is deterministic and side-effect free so it can be unit-tested
// and reused by both the public overview and the manager's monthly reports.

/** Default policy — the company's published breakdown. */
export const DEFAULT_FINANCE: FinanceConfig = {
  currency: "$",
  taxReservePct: 20,
  reserves: [
    { key: "maintenance", label: "Maintenance Fund", pct: 1.0 },
    { key: "future", label: "Future Fund", pct: 1.5 },
    { key: "training", label: "Training Fund", pct: 0.5 },
    { key: "insurance", label: "Insurance Fund", pct: 1.5 },
    { key: "emergency", label: "Emergency Buffer", pct: 0.5 },
  ],
  roleMultipliers: { manager: 2, senior: 1.5, general: 1 },
  estMonthlyIncome: 50000,
  estMonthlyVendor: 0,
};

/** Tiers in display order (highest multiplier first). */
export const TIERS: WorkerRole[] = ["manager", "senior", "general"];

export const TIER_LABEL: Record<WorkerRole, string> = {
  manager: "Management",
  senior: "Senior staff",
  general: "General staff",
};

/** Sum of every reserve percentage (defaults to 5%). */
export function reserveTotalPct(fin: FinanceConfig): number {
  return fin.reserves.reduce((s, r) => s + r.pct, 0);
}

export interface ReserveLine {
  key: string;
  label: string;
  pct: number;
  amount: number;
}

export interface Breakdown {
  gross: number;
  /** Step 1 */
  tax: number;
  vendor: number;
  /** gross − tax − vendor */
  postTax: number;
  /** Step 2 */
  reserves: ReserveLine[];
  reserveTotal: number;
  /** Step 3: the remainder of the post-tax pool */
  wagePool: number;
}

/** Run the full top-to-bottom breakdown for a given gross income + vendor cost. */
export function computeBreakdown(fin: FinanceConfig, gross: number, vendor: number): Breakdown {
  const tax = (gross * fin.taxReservePct) / 100;
  const postTax = gross - tax - vendor;
  const reserves: ReserveLine[] = fin.reserves.map((r) => ({
    key: r.key,
    label: r.label,
    pct: r.pct,
    amount: (postTax * r.pct) / 100,
  }));
  const reserveTotal = reserves.reduce((s, r) => s + r.amount, 0);
  return { gross, tax, vendor, postTax, reserves, reserveTotal, wagePool: postTax - reserveTotal };
}

/** Multiplier for a role, defaulting to 1x if unset. */
export function multiplierFor(fin: FinanceConfig, role: WorkerRole): number {
  return fin.roleMultipliers[role] ?? 1;
}

/** Total weight of the team = Σ role multipliers across all employees. */
export function teamWeight(fin: FinanceConfig, employees: Employee[]): number {
  return employees.reduce((s, e) => s + multiplierFor(fin, e.role), 0);
}

export interface TierWage {
  role: WorkerRole;
  label: string;
  count: number;
  multiplier: number;
  /** projected monthly pay per individual worker from the wage pool */
  perWorker: number;
  /** the whole tier's monthly share = perWorker × count */
  total: number;
}

export interface WageAllocation {
  totalWeight: number;
  /** wage pool value per unit of weight (i.e. a 1x worker's pay) */
  perWeight: number;
  tiers: TierWage[];
}

/**
 * Split a wage pool across the tiers, weighted by role multiplier. When the team
 * is empty the per-worker projection falls back to a representative "one of each
 * tier" basis so the numbers are still meaningful on the overview.
 */
export function allocateWages(
  fin: FinanceConfig,
  employees: Employee[],
  wagePool: number
): WageAllocation {
  const realWeight = teamWeight(fin, employees);
  // Representative basis when nobody is on the team yet.
  const basisWeight =
    realWeight > 0 ? realWeight : TIERS.reduce((s, r) => s + multiplierFor(fin, r), 0);
  const perWeight = basisWeight > 0 ? wagePool / basisWeight : 0;

  const tiers: TierWage[] = TIERS.map((role) => {
    const count = employees.filter((e) => e.role === role).length;
    const multiplier = multiplierFor(fin, role);
    const perWorker = perWeight * multiplier;
    return {
      role,
      label: TIER_LABEL[role],
      count,
      multiplier,
      perWorker,
      total: perWorker * count,
    };
  });
  return { totalWeight: realWeight, perWeight, tiers };
}

export interface ReserveBalance {
  key: string;
  label: string;
  /** accumulated cash from every logged month */
  total: number;
}

export interface ReservesSummary {
  /** number of logged months included */
  months: number;
  /** per-fund accumulated balances, in policy order */
  funds: ReserveBalance[];
  /** sum of all reserve funds */
  total: number;
  /** tax set aside across the same months (an obligation, shown separately) */
  taxSetAside: number;
}

/**
 * Accumulate the actual cash held in each reserve fund from historical data:
 * for every logged month, apply the current policy to its income/vendor and sum
 * the reserve contributions. Matched by fund key so it survives label changes.
 */
export function accumulateReserves(fin: FinanceConfig, reports: MonthlyReport[]): ReservesSummary {
  const funds: ReserveBalance[] = fin.reserves.map((r) => ({ key: r.key, label: r.label, total: 0 }));
  const byKey = new Map(funds.map((f) => [f.key, f]));
  let total = 0;
  let taxSetAside = 0;
  for (const rep of reports) {
    const bd = computeBreakdown(fin, rep.income, rep.vendor);
    taxSetAside += bd.tax;
    for (const line of bd.reserves) {
      const f = byKey.get(line.key);
      if (f) {
        f.total += line.amount;
        total += line.amount;
      }
    }
  }
  return { months: reports.length, funds, total, taxSetAside };
}

/** Format an amount with the configured currency symbol and thousands grouping. */
export function money(fin: FinanceConfig, n: number): string {
  const sym = fin.currency || "$";
  const sign = n < 0 ? "-" : "";
  return sign + sym + Math.round(Math.abs(n)).toLocaleString("en-US");
}

/** Resolve the finance policy from a possibly-incomplete config. */
export function financeOf(cfg: { finance?: FinanceConfig }): FinanceConfig {
  return cfg.finance ?? DEFAULT_FINANCE;
}
