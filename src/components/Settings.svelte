<script lang="ts">
  import {
    state as appState,
    update,
    resetState,
    adminLock,
    setMyEmployeeId,
    setPersonalEnabled,
    addPersonalBlock,
    updatePersonalBlock,
    removePersonalBlock,
    setWakeAlarmEnabled,
    setWakeAlarmTime,
    setBreakReminderEnabled,
    setBreakReminderEvery,
    setBreakReminderMessages,
  } from "../lib/state";
  import { testAlert, requestPermission } from "../lib/notify";
  import { hasBiometric, clearBiometric } from "../lib/biometric";
  import { orgConfig } from "../lib/config";
  import { resolveTemplate } from "../lib/templates";
  import { sortWorkers } from "../lib/workers";
  import type { AlertStyle } from "../lib/types";

  // Who this device belongs to → which schedule template it shows. Picked from
  // the org directory; management assigns each person's template in the Team tool.
  let employees = $derived(sortWorkers($orgConfig.employees));
  let myTemplate = $derived(resolveTemplate($appState.myEmployeeId, $orgConfig));

  let bioOn = $state(hasBiometric());
  function removeBio() {
    clearBiometric();
    bioOn = false;
  }

  const supported = typeof Notification !== "undefined";
  let perm = $state<NotificationPermission>(supported ? Notification.permission : "denied");

  const permHint = $derived(
    !supported
      ? "Not supported on this device"
      : perm === "granted"
        ? "Alerts are allowed on this device"
        : perm === "denied"
          ? "Blocked by your browser"
          : "Allow alerts on this device",
  );

  async function enableNotif() {
    if (!supported || perm === "granted") return;
    await requestPermission();
    perm = Notification.permission;
  }

  const styles: { key: AlertStyle; label: string }[] = [
    { key: "persistent", label: "Persistent" },
    { key: "standard", label: "Standard" },
  ];
  const setStyle = (s: AlertStyle) => update((st) => (st.settings.alertStyle = s));
  const setHours = (which: "start" | "end", v: number) =>
    update((st) => (st.settings.activeHours[which] = Math.max(0, Math.min(23, v))));

  const HOURS = Array.from({ length: 24 }, (_, h) => h);
  const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

  const BREAK_INTERVALS = [10, 15, 20, 30, 45, 60, 90, 120];
</script>

<div class="card">
  <h3 style="text-align:center">Your schedule</h3>
  <div class="set-row">
    <div class="set-label">
      <div>Employee profile</div>
      <div class="muted hint">
        {#if employees.length}
          Pick yourself to use your assigned schedule
        {:else}
          No team set up yet — using the default schedule
        {/if}
      </div>
    </div>
    <div class="set-ctl">
      <select
        aria-label="Which employee this device belongs to"
        disabled={!employees.length}
        value={$appState.myEmployeeId ?? ""}
        onchange={(e) => setMyEmployeeId(e.currentTarget.value || undefined)}
      >
        <option value="">Not set</option>
        {#each employees as w (w.id)}
          <option value={w.id}>{w.name}</option>
        {/each}
      </select>
    </div>
  </div>
  <div class="set-row">
    <div class="set-label">
      <div>Schedule template</div>
      <div class="muted hint">Assigned by management</div>
    </div>
    <span class="badge">{myTemplate.name}</span>
  </div>
</div>

<div class="card">
  <div class="set-row">
    <div class="set-label">
      <div>Off-hours schedule</div>
      <div class="muted hint">Use the schedule + alarms for personal routines on weekends and outside work hours</div>
    </div>
    <button
      class="toggle"
      class:on={$appState.personal.enabled}
      role="switch"
      aria-checked={$appState.personal.enabled}
      aria-label="Enable off-hours schedule"
      onclick={() => setPersonalEnabled(!$appState.personal.enabled)}
    >
      <span class="knob"></span>
    </button>
  </div>

  <div class="set-row">
    <div class="set-label">
      <div>Wake alarm</div>
      <div class="muted hint">Chime at a set time each day, even with the off-hours schedule off</div>
    </div>
    <div class="set-ctl">
      {#if $appState.personal.wakeAlarm?.enabled}
        <input
          type="time"
          aria-label="Wake alarm time"
          value={$appState.personal.wakeAlarm?.time ?? "06:00"}
          onchange={(e) => setWakeAlarmTime(e.currentTarget.value)}
        />
      {/if}
      <button
        class="toggle"
        class:on={$appState.personal.wakeAlarm?.enabled}
        role="switch"
        aria-checked={$appState.personal.wakeAlarm?.enabled ?? false}
        aria-label="Enable wake alarm"
        onclick={() => setWakeAlarmEnabled(!$appState.personal.wakeAlarm?.enabled)}
      >
        <span class="knob"></span>
      </button>
    </div>
  </div>

  {#if $appState.personal.enabled}
    <div class="personal">
      {#each $appState.personal.blocks as b, i (i)}
        <div class="pblock">
          <input
            class="ptime"
            type="time"
            aria-label="Block {i + 1} time"
            value={b.time}
            onchange={(e) => updatePersonalBlock(i, { time: e.currentTarget.value })}
          />
          <div class="pfields">
            <input
              type="text"
              aria-label="Block {i + 1} label"
              placeholder="What you're doing"
              value={b.label}
              oninput={(e) => updatePersonalBlock(i, { label: e.currentTarget.value })}
            />
            <input
              type="text"
              aria-label="Block {i + 1} detail"
              placeholder="Detail (optional)"
              value={b.detail ?? ""}
              oninput={(e) => updatePersonalBlock(i, { detail: e.currentTarget.value })}
            />
          </div>
          <button class="sq" title="Remove block" aria-label="Remove block" onclick={() => removePersonalBlock(i)}>✕</button>
        </div>
      {/each}
      <button class="add" onclick={addPersonalBlock}>+ Add block</button>
      <p class="muted hint" style="margin:8px 0 0">
        Applies on weekends and before {fmtHour($appState.settings.activeHours.start)} / after {fmtHour(
          $appState.settings.activeHours.end
        )} on weekdays (your Focus hours).
      </p>
    </div>
  {/if}
</div>

<div class="card">
  <h3>Alerts</h3>

  <div class="set-row">
    <div class="set-label">
      <div>Notifications</div>
      <div class="muted hint">{permHint}</div>
    </div>
    {#if perm === "granted"}
      <span class="badge on">On</span>
    {:else if !supported}
      <span class="badge">N/A</span>
    {:else}
      <button class="primary" onclick={enableNotif}>Enable</button>
    {/if}
  </div>

  {#if supported && perm !== "default"}
    <details class="howto">
      <summary class="muted hint">How to {perm === "granted" ? "turn off" : "unblock"} notifications</summary>
      <p class="muted hint">
        Tap the lock / ⓘ icon next to the address bar (or open the browser menu → Site settings), find
        <strong>Notifications</strong>, and set it to {perm === "granted" ? "Block" : "Allow"}. In the installed app,
        use your device's notification settings for this app instead.
      </p>
    </details>
  {/if}

  <div class="set-row">
    <div class="set-label">
      <div>Sound</div>
      <div class="muted hint">Test plays the selected sound</div>
    </div>
    <div class="set-ctl">
      <select value={$appState.settings.sound} onchange={(e) => update((st) => (st.settings.sound = e.currentTarget.value))}>
        <option value="chime">Chime</option>
        <option value="bell">Bell</option>
        <option value="alarm">Alarm</option>
      </select>
      <button class="primary" onclick={() => testAlert($appState, myTemplate)}>Test</button>
    </div>
  </div>

  <div class="set-row">
    <div class="set-label">
      <div>Style</div>
      <div class="muted hint">
        {$appState.settings.alertStyle === "persistent" ? "Ongoing notification + chime" : "Plain notification + chime"}
      </div>
    </div>
    <div class="seg compact">
      {#each styles as s}
        <button class:active={$appState.settings.alertStyle === s.key} onclick={() => setStyle(s.key)}>{s.label}</button>
      {/each}
    </div>
  </div>

  <div class="set-row">
    <div class="set-label">
      <div>Focus hours</div>
      <div class="muted hint">Alerts chime at each schedule block within this window</div>
    </div>
    <div class="hours">
      <select aria-label="Start hour" value={$appState.settings.activeHours.start}
        onchange={(e) => setHours("start", +e.currentTarget.value)}>
        {#each HOURS as h}<option value={h}>{fmtHour(h)}</option>{/each}
      </select>
      <span class="muted">–</span>
      <select aria-label="End hour" value={$appState.settings.activeHours.end}
        onchange={(e) => setHours("end", +e.currentTarget.value)}>
        {#each HOURS as h}<option value={h}>{fmtHour(h)}</option>{/each}
      </select>
    </div>
  </div>

  <div class="set-row">
    <div class="set-label">
      <div>Break reminders</div>
      <div class="muted hint">A rotating nudge on the Schedule tab during Focus hours</div>
    </div>
    <div class="set-ctl">
      {#if $appState.settings.breakReminder?.enabled}
        <select
          aria-label="Break interval"
          value={$appState.settings.breakReminder?.everyMin ?? 20}
          onchange={(e) => setBreakReminderEvery(+e.currentTarget.value)}
        >
          {#each BREAK_INTERVALS as m}<option value={m}>every {m} min</option>{/each}
        </select>
      {/if}
      <button
        class="toggle"
        class:on={$appState.settings.breakReminder?.enabled}
        role="switch"
        aria-checked={$appState.settings.breakReminder?.enabled ?? false}
        aria-label="Enable break reminders"
        onclick={() => setBreakReminderEnabled(!$appState.settings.breakReminder?.enabled)}
      >
        <span class="knob"></span>
      </button>
    </div>
  </div>

  {#if $appState.settings.breakReminder?.enabled}
    <label for="break-messages" class="muted hint" style="display:block;margin-bottom:4px">
      Messages (one per line — they rotate in order)
    </label>
    <textarea
      id="break-messages"
      rows="3"
      placeholder="Time to stretch&#10;Remember to drink water"
      value={($appState.settings.breakReminder?.messages ?? []).join("\n")}
      onchange={(e) => setBreakReminderMessages(e.currentTarget.value)}
    ></textarea>
  {/if}
</div>

{#if $appState.manage.signedIn}
  <div class="card set-row">
    <div class="set-label">
      <div>Admin tools</div>
      <div class="muted hint">Unlocked on this device</div>
    </div>
    <div class="set-ctl">
      {#if bioOn}<button onclick={removeBio}>Remove biometric</button>{/if}
      <button onclick={adminLock}>Lock</button>
    </div>
  </div>
{/if}

<div class="card set-row">
  <div class="set-label">
    <div>Reset</div>
    <div class="muted hint">Clear all tasks and settings on this device</div>
  </div>
  <button onclick={() => confirm("Reset all data to defaults?") && resetState()}>Reset</button>
</div>

<footer class="app-foot muted">
  <span>© 2026 Tolin Simpson</span>
  <span aria-hidden="true">·</span>
  <a
    href="https://github.com/TolinSimpson/business-management-suite"
    target="_blank"
    rel="noopener noreferrer">Source code</a
  >
</footer>

<style>
  .set-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .card.set-row {
    padding: 16px;
    border-bottom: 1px solid var(--line);
  }
  .card .set-row:first-of-type {
    padding-top: 0;
  }
  .card .set-row:last-of-type {
    border-bottom: none;
    padding-bottom: 0;
  }
  .set-label > div:first-child {
    font-weight: 600;
  }
  .hint {
    font-size: 0.78rem;
    line-height: 1.35;
  }
  .set-ctl {
    display: flex;
    gap: 8px;
    flex: 0 0 auto;
  }
  .set-ctl select,
  .set-ctl input {
    width: auto;
  }
  .seg.compact {
    margin: 0;
    flex: 0 0 auto;
  }
  .seg.compact button {
    padding: 8px 12px;
  }
  .hours {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }
  .hours select {
    width: auto;
  }

  /* On/off switch */
  .toggle {
    flex: 0 0 auto;
    width: 46px;
    height: 26px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    padding: 2px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .toggle.on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .toggle .knob {
    display: block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }
  .toggle.on .knob {
    transform: translateX(20px);
  }

  /* Personal off-hours block editor */
  .personal {
    padding-top: 12px;
  }
  .pblock {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
  }
  .ptime {
    width: auto;
    flex: 0 0 auto;
  }
  .pfields {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .add {
    font-size: 0.85rem;
  }
  .sq {
    width: 34px;
    height: 34px;
    padding: 0;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Permission status badge */
  .badge {
    flex: 0 0 auto;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .badge.on {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
  }

  /* App footer: copyright + source link */
  .app-foot {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px 0 8px;
    font-size: 0.78rem;
  }
  .app-foot a {
    color: var(--accent);
  }

  /* How-to disclosure */
  .howto {
    border-bottom: 1px solid var(--line);
    padding: 10px 0;
  }
  .howto summary {
    cursor: pointer;
    list-style: none;
  }
  .howto summary::-webkit-details-marker {
    display: none;
  }
  .howto summary::before {
    content: "▸ ";
  }
  .howto[open] summary::before {
    content: "▾ ";
  }
  .howto p {
    margin: 8px 0 0;
  }
</style>
