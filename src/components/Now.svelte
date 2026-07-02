<script lang="ts">
  import { state as appState, setTaskNote, toggleStep } from "../lib/state";
  import { orgConfig } from "../lib/config";
  import { dayTemplate, PERSONAL_TEMPLATE_ID } from "../lib/templates";
  import { nowView, dateKey, displayLabel, nextDay, formatTime, findHoliday } from "../lib/schedule";
  import { isWakeLockSupported } from "../lib/wakelock";
  import { focus } from "../lib/focus";
  import Checklist from "./Checklist.svelte";
  import Appointments from "./Appointments.svelte";

  // `previewNow` lets the dev preview tool freeze the clock at an arbitrary time
  // to inspect time-dependent UI (the plan block, an appointment). Undefined in
  // normal use, where the clock ticks live.
  let { previewNow }: { previewNow?: Date } = $props();

  // Reactive clock — re-render every 20s so the active block + countdown stay live.
  // svelte-ignore state_referenced_locally
  let now = $state(previewNow ?? new Date());
  $effect(() => {
    if (previewNow) {
      now = previewNow;
      return;
    }
    const id = setInterval(() => (now = new Date()), 20_000);
    return () => clearInterval(id);
  });

  let dk = $derived(dateKey(now));
  // A company-wide day off takes over the whole screen.
  let holiday = $derived(findHoliday($orgConfig.holidays, dk));
  // The schedule in effect now: personal off-hours schedule when applicable,
  // else the device's assigned work template — with today's one-off appointments
  // (personal + company events) overlaid on top.
  let template = $derived(dayTemplate($appState, $orgConfig, now));
  let isPersonal = $derived(template.id === PERSONAL_TEMPLATE_ID);
  // Until the user picks who they are (Settings → "I am"), a work schedule is just
  // the company default — prompt them to identify first. Holidays + personal
  // off-hours schedules don't depend on an employee identity, so they still show.
  let needsIdentity = $derived(!$appState.myEmployeeId);
  let hasEmployees = $derived(($orgConfig.employees?.length ?? 0) > 0);
  // Bound the final block of a *work* day at the end of the Focus window so the
  // countdown reads the real end of day (not midnight). Personal off-hours blocks
  // (e.g. Sleep) legitimately run to midnight, so they pass no cap.
  let dayEndMin = $derived(isPersonal ? undefined : $appState.settings.activeHours.end * 60);
  let view = $derived(holiday ? null : nowView(template, $appState, now, dayEndMin));
  // The 4 PM block plans for tomorrow; its fields write to tomorrow's blocks.
  let tomorrowKey = $derived(dateKey(nextDay(now)));
  function planValue(time: string): string {
    return $appState.days[tomorrowKey]?.blocks[time]?.taskNote ?? "";
  }

  // Flash the card when the active block changes (a glanceable cue in Focus mode).
  let flash = $state(false);
  let lastTime: string | undefined;
  $effect(() => {
    const t = view?.time;
    if (t && lastTime !== undefined && t !== lastTime) {
      flash = true;
      setTimeout(() => (flash = false), 2500);
    }
    lastTime = t;
  });

  function fmtClock(d: Date) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function fmtRemaining(min: number) {
    if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}m left`;
    return `${min}m left`;
  }
</script>

{#if holiday}
  <div class="card holiday-card">
    <div class="holiday-emoji">🎉</div>
    <div class="holiday-name">{holiday.name}</div>
    <p class="muted">Enjoy your day off — no schedule today.</p>
  </div>
{:else if needsIdentity && !isPersonal}
  <div class="card">
    <h3 style="margin-top:0;text-align:center">Who are you?</h3>
    {#if hasEmployees}
      <p class="muted" style="margin-bottom:0">
        To see your schedule, open <b>Settings</b> and choose yourself under
        <b>Employee profile</b>. Your assigned schedule will then appear here.
      </p>
    {:else}
      <p class="muted" style="margin-bottom:0">
        No team members have been added yet. A manager needs to add employees in the
        Management tool before you can pick yourself under <b>Settings → Employee profile</b>.
      </p>
    {/if}
  </div>
{:else if view}
  <div class="card now-card" class:flash>
    <div class="now-time">
      {fmtClock(now)} · {now.toLocaleDateString([], { weekday: "long" })}
      {#if isPersonal}<span class="pill">Personal</span>{/if}
      {#if view.isEvent}<span class="pill">Appointment</span>{/if}
    </div>
    <div class="now-label">{displayLabel(view.label)}</div>
    {#if view.detail}<div class="now-theme">{view.detail}</div>{/if}
    {#if view.taskNote}<div class="now-task">{view.taskNote}</div>{/if}
    <div class="now-meta">
      {fmtRemaining(view.endsInMin)}
      {#if view.next}· next: {displayLabel(view.next.label)}{/if}
    </div>
  </div>

  {#if $focus}
    <p class="muted" style="margin-top:-4px;font-size:.82rem">
      Screen staying awake{isWakeLockSupported() ? "" : " (not supported on this browser)"}. Keep the app open and charging.
    </p>
  {/if}

  {#if view.isPlan}
    <!-- Planning block: each field surfaces on the matching block tomorrow.
         Configured per step via the block's `plan` inputs. -->
    <div class="card">
      <h3>Plan for tomorrow</h3>
      <p class="muted" style="margin-top:0;font-size:.85rem">
        {now.toLocaleDateString([], { weekday: "long" })} → these appear in tomorrow's matching time slots.
      </p>
      {#each view.planTargets as t}
        <label for={"plan-" + t.key}>{t.label} ({formatTime(t.time)})</label>
        <textarea
          id={"plan-" + t.key}
          value={planValue(t.time)}
          oninput={(e) => setTaskNote(tomorrowKey, t.time, e.currentTarget.value)}
        ></textarea>
        <div style="height:10px"></div>
      {/each}
    </div>

    <!-- Set one-off calendar entries while planning (defaults to tomorrow). -->
    <div class="card">
      <h3>Appointments</h3>
      <p class="muted" style="margin-top:0;font-size:.85rem">
        Add a one-off calendar entry for any day — it appears on your schedule that day.
      </p>
      <Appointments defaultDate={tomorrowKey} />
    </div>
  {/if}

  {#if view.checklist.length}
    <div class="card">
      <h3>Process</h3>
      <Checklist items={view.checklist} onToggle={(step) => toggleStep(dk, view!.time, step)} />
    </div>
  {/if}
{:else}
  <div class="card">
    {#if template.blocks.length}
      <p class="muted">
        Nothing scheduled right now — {template.name} runs {formatTime(template.blocks[0].time)} – {formatTime(
          template.blocks[template.blocks.length - 1].time
        )}.
      </p>
    {:else}
      <p class="muted">No schedule set. Add blocks under Settings → Off-hours schedule, or pick yourself under "I am".</p>
    {/if}
  </div>
{/if}

<style>
  .holiday-card {
    text-align: center;
    padding: 28px 16px;
  }
  .holiday-emoji {
    font-size: 2.4rem;
    line-height: 1;
  }
  .holiday-name {
    margin-top: 10px;
    font-size: 1.25rem;
    font-weight: 700;
  }
  .holiday-card p {
    margin: 6px 0 0;
  }
  .pill {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--accent-dim);
    color: var(--accent);
    font-size: 0.7rem;
    font-weight: 600;
    vertical-align: middle;
  }
</style>
