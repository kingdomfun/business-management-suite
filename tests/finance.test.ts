import { describe, it, expect } from "vitest";
import {
  DEFAULT_FINANCE,
  computeBreakdown,
  allocateWages,
  accumulateReserves,
  reserveTotalPct,
  teamWeight,
  money,
} from "../src/lib/finance";
import type { Employee, MonthlyReport } from "../src/lib/types";

const fin = DEFAULT_FINANCE;

function emp(role: Employee["role"], i: number): Employee {
  return { id: `${role}-${i}`, name: `${role} ${i}`, role };
}

describe("reserveTotalPct", () => {
  it("sums to the published 5%", () => {
    expect(reserveTotalPct(fin)).toBeCloseTo(5);
  });
});

describe("computeBreakdown", () => {
  const bd = computeBreakdown(fin, 100_000, 10_000);

  it("takes 20% of gross as tax", () => {
    expect(bd.tax).toBe(20_000);
  });

  it("post-tax pool is gross minus tax and vendor", () => {
    expect(bd.postTax).toBe(70_000); // 100k - 20k tax - 10k vendor
  });

  it("reserves are 5% of the post-tax pool", () => {
    expect(bd.reserveTotal).toBeCloseTo(3_500); // 5% of 70k
    expect(bd.reserves).toHaveLength(5);
  });

  it("wage pool is the 95% remainder of the post-tax pool", () => {
    expect(bd.wagePool).toBeCloseTo(66_500); // 70k - 3.5k
  });

  it("the four budget segments sum back to gross", () => {
    expect(bd.tax + bd.vendor + bd.reserveTotal + bd.wagePool).toBeCloseTo(100_000);
  });
});

describe("allocateWages", () => {
  it("weights pay by role multiplier", () => {
    const team = [emp("manager", 1), emp("senior", 1), emp("general", 1)];
    const pool = 45_000;
    const a = allocateWages(fin, team, pool);
    // weights 2 + 1.5 + 1 = 4.5 → 1x worker earns 10k
    expect(a.totalWeight).toBeCloseTo(4.5);
    expect(a.perWeight).toBeCloseTo(10_000);
    const general = a.tiers.find((t) => t.role === "general")!;
    const senior = a.tiers.find((t) => t.role === "senior")!;
    const manager = a.tiers.find((t) => t.role === "manager")!;
    expect(general.perWorker).toBeCloseTo(10_000);
    expect(senior.perWorker).toBeCloseTo(15_000);
    expect(manager.perWorker).toBeCloseTo(20_000);
  });

  it("the whole pool is distributed across the team", () => {
    const team = [emp("manager", 1), emp("general", 1), emp("general", 2)];
    const pool = 40_000;
    const a = allocateWages(fin, team, pool);
    const total = a.tiers.reduce((s, t) => s + t.total, 0);
    expect(total).toBeCloseTo(pool);
  });

  it("falls back to a one-of-each basis when the team is empty", () => {
    const a = allocateWages(fin, [], 45_000);
    expect(a.totalWeight).toBe(0); // real team is empty
    expect(a.perWeight).toBeCloseTo(10_000); // basis weight 4.5
    expect(a.tiers.every((t) => t.count === 0)).toBe(true);
  });

  it("reports per-role headcount, per-individual pay, and the tier total", () => {
    const team = [emp("manager", 1), emp("general", 1), emp("general", 2)];
    const a = allocateWages(fin, team, 40_000); // weight 2 + 1 + 1 = 4 → perWeight 10k
    const general = a.tiers.find((t) => t.role === "general")!;
    expect(general.count).toBe(2);
    expect(general.perWorker).toBeCloseTo(10_000);
    expect(general.total).toBeCloseTo(20_000); // 2 people × 10k
  });
});

describe("accumulateReserves", () => {
  const reports: MonthlyReport[] = [
    { id: "a", month: "2026-01", income: 100_000, vendor: 10_000 }, // pool 70k
    { id: "b", month: "2026-02", income: 50_000, vendor: 0 }, // pool 40k
  ];

  it("sums each fund's contribution across all logged months", () => {
    const s = accumulateReserves(DEFAULT_FINANCE, reports);
    expect(s.months).toBe(2);
    // Maintenance Fund is 1% of pool: 1% of 70k + 1% of 40k = 700 + 400 = 1100
    const maint = s.funds.find((f) => f.key === "maintenance")!;
    expect(maint.label).toBe("Maintenance Fund");
    expect(maint.total).toBeCloseTo(1_100);
  });

  it("totals all reserve funds and tracks tax separately", () => {
    const s = accumulateReserves(DEFAULT_FINANCE, reports);
    // reserves are 5% of each pool: 5% of (70k + 40k) = 5,500
    expect(s.total).toBeCloseTo(5_500);
    // tax is 20% of each gross: 20% of (100k + 50k) = 30,000
    expect(s.taxSetAside).toBeCloseTo(30_000);
  });

  it("is zero with no logged months", () => {
    const s = accumulateReserves(DEFAULT_FINANCE, []);
    expect(s.months).toBe(0);
    expect(s.total).toBe(0);
    expect(s.funds.every((f) => f.total === 0)).toBe(true);
  });
});

describe("teamWeight", () => {
  it("sums role multipliers", () => {
    expect(teamWeight(fin, [emp("manager", 1), emp("senior", 1)])).toBeCloseTo(3.5);
  });
});

describe("money", () => {
  it("formats with the currency symbol and grouping", () => {
    expect(money(fin, 12345)).toBe("$12,345");
    expect(money(fin, -500)).toBe("-$500");
  });
});
