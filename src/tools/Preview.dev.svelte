<script module lang="ts">
  export const meta = {
    name: "UI Preview",
    icon: "calendar",
    description: "Preview the schedule at any time — dev only",
    order: 99,
    dev: true,
  };
</script>

<script lang="ts">
  // Dev-only harness for inspecting time- and gate-dependent UI without logging
  // in, entering a PAT, or waiting for a particular hour. This file is named
  // *.dev.svelte, so it's only registered under `npm run dev` (see lib/tools.ts).
  import Now from "../components/Now.svelte";
  import Appointments from "../components/Appointments.svelte";

  function pad(n: number): string {
    return String(n).padStart(2, "0");
  }
  /** Date → the value shape a <input type="datetime-local"> expects (local time). */
  function toLocalInput(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const init = new Date();
  init.setHours(16, 0, 0, 0); // default to the 4 PM plan block
  let dt = $state(toLocalInput(init));
  let previewNow = $derived(new Date(dt));

  /** Jump to a given hour on the currently-selected day. */
  function setHour(h: number) {
    const d = new Date(dt);
    d.setHours(h, 0, 0, 0);
    dt = toLocalInput(d);
  }
</script>

<div class="card">
  <h3 style="margin-top:0">Preview the Now screen</h3>
  <p class="muted note">
    Simulate any date &amp; time to see the schedule, the end-of-day plan block, and
    any appointments — no login or waiting required. Tip: pick yourself under
    <b>Settings → Employee profile</b> to preview your work schedule.
  </p>
  <input type="datetime-local" aria-label="Simulated date and time" bind:value={dt} />
  <div class="quick">
    <button onclick={() => setHour(9)}>9 AM</button>
    <button onclick={() => setHour(12)}>12 PM</button>
    <button onclick={() => setHour(16)}>4 PM plan</button>
    <button onclick={() => setHour(20)}>8 PM</button>
  </div>
</div>

<div class="frame">
  <div class="frame-tag">Now · {previewNow.toLocaleString()}</div>
  <Now {previewNow} />
</div>

<div class="card">
  <h3 style="margin-top:0">Calendar input</h3>
  <p class="muted note">The appointment editor as it appears in Settings and the plan block.</p>
  <Appointments defaultDate={dt.slice(0, 10)} />
</div>

<style>
  .note {
    margin: 0 0 10px;
    font-size: 0.85rem;
  }
  .quick {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .quick button {
    flex: 1 1 auto;
  }
  /* A subtle frame around the live-rendered Now screen so it reads as a preview. */
  .frame {
    border: 1px dashed var(--line);
    border-radius: var(--radius);
    padding: 12px;
    margin-bottom: 16px;
  }
  .frame-tag {
    font-size: 0.75rem;
    color: var(--muted);
    margin-bottom: 8px;
    font-variant-numeric: tabular-nums;
  }
</style>
