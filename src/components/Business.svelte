<script lang="ts">
  import { state as appState } from "../lib/state";
  import { orgConfig } from "../lib/config";
  import { sortWorkers } from "../lib/workers";
  import {
    financeOf,
    computeBreakdown,
    allocateWages,
    accumulateReserves,
    reserveTotalPct,
    money,
  } from "../lib/finance";
  import Pie from "./Pie.svelte";

  let fin = $derived(financeOf($orgConfig));
  let employees = $derived(sortWorkers($orgConfig.employees));

  // Logged monthly actuals, keyed "YYYY-MM" for quick lookup.
  let reportsByMonth = $derived(new Map($appState.reports.map((r) => [r.month, r])));

  const now = new Date();
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let year = $state(now.getFullYear());
  let selMonth = $state(now.getMonth()); // 0–11

  function monthKey(y: number, m: number): string {
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  // The selected month: a logged report = historical actuals; otherwise the
  // current projection model set by management (estimates + policy).
  let selKey = $derived(monthKey(year, selMonth));
  let actual = $derived(reportsByMonth.get(selKey) ?? null);
  let gross = $derived(actual ? actual.income : fin.estMonthlyIncome);
  let vendor = $derived(actual ? actual.vendor : fin.estMonthlyVendor);
  let bd = $derived(computeBreakdown(fin, gross, vendor));
  let wages = $derived(allocateWages(fin, employees, bd.wagePool));
  let reservePct = $derived(reserveTotalPct(fin));

  // Actual cash held in each reserve fund, accumulated from every logged month.
  let held = $derived(accumulateReserves(fin, $appState.reports));

  // The 12 numbered buttons for the selected year. Each is coloured by time
  // (past / current / future) and dotted if it has logged actuals.
  let monthsInfo = $derived(
    MONTHS.map((label, m) => {
      const cy = now.getFullYear();
      const cm = now.getMonth();
      const status =
        year < cy || (year === cy && m < cm) ? "past" : year === cy && m === cm ? "current" : "future";
      return { m, label, num: m + 1, hasActual: reportsByMonth.has(monthKey(year, m)), status };
    })
  );

  // Pie segments are shares of gross income (they sum to 100%).
  const C = { tax: "#e0668a", vendor: "#d8a657", reserves: "var(--accent)", wages: "var(--good)" };
  let segments = $derived([
    { label: "Tax reserve", value: bd.tax, color: C.tax },
    { label: "Vendor expenses", value: bd.vendor, color: C.vendor },
    { label: "Internal reserves", value: bd.reserveTotal, color: C.reserves },
    { label: "Worker wage pool", value: bd.wagePool, color: C.wages },
  ]);

</script>

<!-- 1) Total company funds + reserve breakdown, accumulated from logged months. -->
<div class="card">
  <h3 style="margin:0;text-align:center">{$orgConfig.company.name || "Business"}</h3>
  <div class="muted card-sub" style="text-align:center">Reserve funds on hand</div>
  {#if held.months > 0}
    <div class="held-total">{money(fin, held.total)}</div>
    <div class="held-sub muted">total cash held across {held.months} logged {held.months === 1 ? "month" : "months"}</div>
    <div class="tiers">
      {#each held.funds as f (f.key)}
        <div class="line"><span>{f.label}</span><b>{money(fin, f.total)}</b></div>
      {/each}
    </div>
    <p class="muted note">Separately, {money(fin, held.taxSetAside)} has been set aside for tax.</p>
  {:else}
    <p class="muted" style="margin:8px 0 0">
      No actuals logged yet. Add a month's real income in the Management tool to start tracking reserve balances.
    </p>
  {/if}
</div>

<!-- 2) Month selector: pick a month to inspect below. -->
<div class="card">
  <div class="histhead">
    <span class="co">Monthly history</span>
    <div class="yearnav">
      <button class="nav" onclick={() => year--} aria-label="Previous year">‹</button>
      <span class="yr">{year}</span>
      <button class="nav" onclick={() => year++} aria-label="Next year">›</button>
    </div>
  </div>
  <div class="months">
    {#each monthsInfo as mi (mi.m)}
      <button
        class="mbtn {mi.status}"
        class:active={selMonth === mi.m}
        class:has={mi.hasActual}
        title={mi.hasActual ? `${mi.label} — actuals logged` : mi.label}
        onclick={() => (selMonth = mi.m)}
      >
        {mi.num}
      </button>
    {/each}
  </div>
</div>

<!-- 3) Stats for the selected month. -->
<div class="card">
  <div class="selhead">
    <h3 style="margin:0">{MONTHS[selMonth]} {year}</h3>
    <span class="badge" class:act={!!actual}>{actual ? "Actual" : "Projected"}</span>
  </div>

  {#if gross > 0}
    {#if actual?.note}<p class="muted note">{actual.note}</p>{/if}
    <!-- Pie is a split of gross income; legend shows the dollar amounts. -->
    <div class="chartwrap">
      <Pie {segments} size={140} thickness={22} center={money(fin, gross)} />
      <div class="legend">
        {#each segments as s (s.label)}
          <div class="leg">
            <span class="dot" style="background:{s.color}"></span>
            <span class="leg-lab">{s.label}</span>
            <span class="leg-val">{money(fin, s.value)}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Wages: the pool is split among current staff, weighted by role. The role
         totals add up to the pool (not to gross). Per-person only when staffed. -->
    <div class="wage-head">
      <span>Worker wages</span>
      <span class="muted">{money(fin, bd.wagePool)}/mo pool</span>
    </div>
    <p class="muted note" style="margin-top:2px">
      Split among current staff by role multiplier — the role totals add up to the pool.
    </p>
    <div class="tiers">
      {#each wages.tiers as t (t.role)}
        <div class="tier">
          <div class="t-main">
            <span class="lab">{t.label} <span class="mult">×{t.multiplier}</span></span>
            <span class="rtotal">{money(fin, t.total)}<span class="muted">/mo</span></span>
          </div>
          <div class="t-sub muted">
            {t.count} {t.count === 1 ? "person" : "people"}{#if t.count > 0} · {money(fin, t.perWorker)} each{/if}
          </div>
        </div>
      {/each}
    </div>
    {#if wages.totalWeight === 0}
      <p class="muted note">No employees yet — add them in Management to distribute the pool.</p>
    {/if}

    <details class="full">
      <summary>Full breakdown</summary>
      <div class="line"><span>Gross income</span><b>{money(fin, bd.gross)}</b></div>
      <div class="line sub"><span>− Tax reserve ({fin.taxReservePct}% of gross)</span><b>−{money(fin, bd.tax)}</b></div>
      <div class="line sub"><span>− Vendor expenses</span><b>−{money(fin, bd.vendor)}</b></div>
      <div class="line total"><span>= Net revenue pool</span><b>{money(fin, bd.postTax)}</b></div>
      <div class="poolnote muted">
        Split of the pool: {reservePct}% reserves, {(100 - reservePct).toFixed(1)}% wages
      </div>
      {#each bd.reserves as r (r.key)}
        <div class="line sub"><span>{r.label} ({r.pct}% of pool)</span><b>−{money(fin, r.amount)}</b></div>
      {/each}
      <div class="line"><span>Internal reserves ({reservePct}% of pool)</span><b>−{money(fin, bd.reserveTotal)}</b></div>
      <div class="line total"><span>Worker wage pool ({(100 - reservePct).toFixed(1)}% of pool)</span><b>{money(fin, bd.wagePool)}</b></div>
    </details>
  {:else}
    <p class="muted" style="margin:8px 0 0">
      No figures for this month. Log it in the Management tool, or set an income estimate there.
    </p>
  {/if}
</div>

<style>
  /* Annual history */
  .histhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }
  .co {
    font-weight: 650;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .yearnav {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }
  .yearnav .nav {
    padding: 2px 10px;
    font-size: 1.1rem;
    line-height: 1;
  }
  .yr {
    font-weight: 700;
    min-width: 44px;
    text-align: center;
  }
  /* 12 numbered buttons in one horizontal row. */
  .months {
    display: flex;
    gap: 5px;
  }
  .mbtn {
    flex: 1 1 0;
    min-width: 0;
    padding: 8px 0;
    border-radius: 8px;
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
    border: 1px solid transparent;
    position: relative;
  }
  /* Time-based colour coding. */
  .mbtn.past {
    background: var(--surface-2);
    color: var(--text);
  }
  .mbtn.future {
    background: var(--bg);
    color: var(--muted);
  }
  .mbtn.current {
    background: var(--accent);
    color: #0f1115;
    font-weight: 700;
  }
  /* Selected month: accent ring on top of whatever colour it has. */
  .mbtn.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  /* A logged-actuals month gets a small marker dot. */
  .mbtn.has::after {
    content: "";
    position: absolute;
    top: 3px;
    right: 3px;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--good);
  }

  .note {
    margin: 8px 0 0;
    font-size: 0.8rem;
  }

  /* Wages — per-role headcount, per-person pay, and the role total. */
  .wage-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: 14px;
    font-weight: 650;
    font-size: 0.95rem;
  }
  .wage-head .muted {
    font-weight: 400;
    font-size: 0.8rem;
  }
  .tiers {
    margin-top: 6px;
    border-top: 1px solid var(--line);
  }
  .tier {
    padding: 7px 0;
    border-bottom: 1px solid var(--line);
  }
  .t-main {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .t-main .lab {
    flex: 1 1 auto;
    font-weight: 600;
  }
  .mult {
    color: var(--accent);
    font-weight: 400;
    font-size: 0.82rem;
  }
  .rtotal {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .rtotal .muted {
    font-weight: 400;
    font-size: 0.76rem;
  }
  .t-sub {
    font-size: 0.8rem;
    margin-top: 1px;
  }

  .poolnote {
    font-size: 0.78rem;
    padding: 2px 0 4px;
  }

  /* Reserve funds on hand — accumulated treasury. */
  .card-sub {
    font-size: 0.82rem;
    margin-top: 2px;
  }
  .held-total {
    font-size: 1.9rem;
    font-weight: 700;
    color: var(--good);
    margin-top: 10px;
    font-variant-numeric: tabular-nums;
  }
  .held-sub {
    font-size: 0.8rem;
    margin-bottom: 6px;
  }

  details.full {
    margin-top: 10px;
  }
  details.full summary {
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--accent);
    user-select: none;
  }
  details.full .line:first-of-type {
    margin-top: 8px;
  }

  .selhead {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .selhead h3 {
    flex: 1 1 auto;
  }
  .badge {
    font-size: 0.7rem;
    padding: 2px 9px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .badge.act {
    background: rgba(78, 201, 138, 0.15);
    border-color: var(--good);
    color: var(--good);
  }

  .chartwrap {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 12px;
  }
  .legend {
    flex: 1 1 200px;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .leg {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.88rem;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    flex: 0 0 auto;
  }
  .leg-lab {
    flex: 1 1 auto;
  }
  .leg-val {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  /* Rows inside the collapsible "Full breakdown". */
  .line {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
    font-size: 0.88rem;
  }
  .line b {
    font-variant-numeric: tabular-nums;
  }
  .line.sub {
    padding-left: 16px;
    color: var(--muted);
    font-size: 0.83rem;
  }
  .line.total {
    border-top: 1px solid var(--line);
    margin-top: 4px;
    padding-top: 7px;
    font-weight: 600;
  }
</style>
