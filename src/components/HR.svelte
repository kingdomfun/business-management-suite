<script lang="ts">
  import { orgConfig } from "../lib/config";
  import { sortWorkers, ROLE_LABEL } from "../lib/workers";
  import { employeeTemplate, withEvents } from "../lib/templates";
  import { eventsForDay, dateKey, formatTime, displayLabel, toMinutes } from "../lib/schedule";
  import type { Employee } from "../lib/types";
  import Icon from "./Icon.svelte";
  import EmailModal from "./EmailModal.svelte";

  let company = $derived($orgConfig.company);
  let employees = $derived(sortWorkers($orgConfig.employees));

  // The built-in social channels, always shown in this order. Each renders as a
  // centred brand icon — grey + clickable when a link is set, darker + inert
  // when it isn't, so the row reads as "what's available / not yet set up".
  // "website" is special-cased to company.website; the rest live in company.social.
  const SOCIAL_OPTIONS = [
    { key: "website", icon: "globe" },
    { key: "discord", icon: "discord" },
    { key: "telegram", icon: "telegram" },
    { key: "linkedin", icon: "linkedin" },
    { key: "instagram", icon: "instagram" },
    { key: "facebook", icon: "facebook" },
    { key: "youtube", icon: "youtube" },
    { key: "github", icon: "github" },
  ];
  const BUILTIN_KEYS = new Set(SOCIAL_OPTIONS.map((o) => o.key));

  let builtin = $derived(
    SOCIAL_OPTIONS.map((o) => ({
      ...o,
      label: o.key,
      url: (o.key === "website" ? company.website : company.social?.[o.key])?.trim() ?? "",
    }))
  );
  // Custom links a manager added (any social key that isn't built in). These only
  // appear once set, using a generic link glyph with the key as the label.
  let custom = $derived(
    Object.entries(company.social ?? {})
      .filter(([key, url]) => !BUILTIN_KEYS.has(key) && url?.trim())
      .map(([key, url]) => ({ key, icon: "link", label: key, url: url.trim() }))
  );
  let links = $derived([...builtin, ...custom]);

  let emailTarget = $state<Employee | null>(null);
  // The employee whose schedule is being viewed in-app (null = the team list).
  // Kept in-app rather than opening a share link in a new tab, so iPhone users
  // always have a Back button to return to HR.
  let viewing = $state<Employee | null>(null);

  // This employee's daily schedule with today's appointments overlaid, mirroring
  // what their own device would show today. Personal (device-local) events don't
  // belong to another person, so only company events targeting them are applied.
  let daySchedule = $derived.by(() => {
    const w = viewing;
    if (!w) return null;
    const today = dateKey(new Date());
    const events = eventsForDay(today, w.id, $orgConfig.events, []);
    return withEvents(employeeTemplate(w, $orgConfig), events);
  });

  // Upcoming company appointments targeting this employee (today onward), so a
  // manager can see what's coming, not just what lands on today's schedule.
  let upcoming = $derived.by(() => {
    const w = viewing;
    if (!w) return [];
    const from = dateKey(new Date());
    return ($orgConfig.events ?? [])
      .filter((e) => e.date >= from && (!e.employeeIds?.length || e.employeeIds.includes(w.id)))
      .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.time) - toMinutes(b.time));
  });

  function fmtDate(date: string) {
    return new Date(date + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }

  function open(url?: string) {
    if (url) window.open(url, "_blank", "noopener");
  }
  function call(phone?: string) {
    if (phone) location.href = `tel:${phone.trim()}`;
  }
  function openEmail(w: Employee) {
    if (w.email) emailTarget = w;
  }
</script>

{#if viewing}
  <!-- In-app employee schedule detail. A back banner (mirrors the Tools tab)
       returns to the team list — essential on iPhone, which otherwise has no
       way back from a schedule opened in a new tab. -->
  <div class="hr-banner">
    <button class="hr-back" onclick={() => (viewing = null)}>
      <span class="chev">‹</span> HR
    </button>
    <span class="hr-banner-name">
      <Icon name="calendar" size={18} />
      Schedule
    </span>
  </div>

  <div class="card">
    <div class="lab">{viewing.name}</div>
    <div class="sub">{ROLE_LABEL[viewing.role]}</div>
  </div>

  <div class="card">
    <h3 class="sec-head">Today</h3>
    {#if daySchedule && daySchedule.blocks.length}
      {#each daySchedule.blocks as b (b.time + b.label)}
        <div class="row">
          <div class="t">{formatTime(b.time)}</div>
          <div style="flex:1;min-width:0">
            <div class="lab">
              {displayLabel(b.label)}
              {#if b.event}<span class="pill">Appointment</span>{/if}
            </div>
            {#if b.detail}<div class="sub">{b.detail}</div>{/if}
          </div>
        </div>
      {/each}
    {:else}
      <p class="muted" style="margin:0">No schedule today.</p>
    {/if}
  </div>

  <div class="card">
    <h3 class="sec-head">Upcoming appointments</h3>
    {#if upcoming.length}
      {#each upcoming as e (e.id)}
        <div class="row">
          <div class="when">
            <div>{fmtDate(e.date)}</div>
            <div class="sub">{formatTime(e.time)}</div>
          </div>
          <div style="flex:1;min-width:0">
            <div class="lab">{displayLabel(e.label)}</div>
            {#if e.detail}<div class="sub">{e.detail}</div>{/if}
          </div>
        </div>
      {/each}
    {:else}
      <p class="muted" style="margin:0">No upcoming appointments.</p>
    {/if}
  </div>
{:else}
<div class="card">
  <h3 class="socials-head">Our Socials</h3>

  <div class="socials">
    {#each links as l (l.key)}
      <button
        class="social"
        class:off={!l.url}
        title={l.url ? l.label : `${l.label} — not set up`}
        aria-label={l.label}
        disabled={!l.url}
        onclick={() => open(l.url)}
      >
        <Icon name={l.icon} size={22} />
      </button>
    {/each}
  </div>
</div>

{#if employees.length === 0}
  <div class="card">
    <p class="muted">No team members yet. A manager can add them in the Team tool.</p>
  </div>
{:else}
  <div class="card">
    {#each employees as w (w.id)}
      <div class="row">
        <div style="flex:1;min-width:0">
          <div class="lab">{w.name}</div>
          <div class="sub">{ROLE_LABEL[w.role]}</div>
        </div>
        <div class="hr-actions">
          <button class="ico-btn" title="Call" aria-label="Call {w.name}" disabled={!w.phone} onclick={() => call(w.phone)}>
            <Icon name="phone" size={18} />
          </button>
          <button class="ico-btn" title="Email" aria-label="Email {w.name}" disabled={!w.email} onclick={() => openEmail(w)}>
            <Icon name="mail" size={18} />
          </button>
          <button class="ico-btn" title="View schedule" aria-label="View {w.name}'s schedule" onclick={() => (viewing = w)}>
            <Icon name="calendar" size={18} />
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}
{/if}

{#if emailTarget}
  <EmailModal email={emailTarget.email ?? ""} name={emailTarget.name} onClose={() => (emailTarget = null)} />
{/if}

<style>
  /* Back banner for the employee schedule sub-view — mirrors Tools.svelte so the
     drill-in / back-out gesture is consistent across the app. */
  .hr-banner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--modal-w);
    margin: -16px auto 16px;
    padding: 10px 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    border-radius: 0 0 var(--radius) var(--radius);
  }
  .hr-back {
    position: absolute;
    left: 12px;
    background: none;
    border: none;
    border-radius: 0;
    padding: 4px 0;
    color: var(--accent);
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .hr-back .chev {
    font-size: 1.2rem;
    line-height: 1;
  }
  .hr-banner-name {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text);
    font-weight: 600;
  }
  .sec-head {
    margin: 0 0 8px;
  }
  /* Wider than the schedule's .t column so a full date ("Mon, Jul 7") fits. */
  .when {
    width: 92px;
    flex: 0 0 auto;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .socials-head {
    margin: 0;
    text-align: center;
  }
  .socials {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 18px;
    margin-top: 14px;
  }
  .social {
    background: none;
    border: none;
    padding: 4px;
    color: var(--muted);
    cursor: pointer;
    transition: color 0.15s;
  }
  .social:hover {
    color: var(--text);
  }
  /* No link assigned — darker grey and inert. */
  .social.off {
    color: var(--line);
    cursor: default;
  }
  .social.off:hover {
    color: var(--line);
  }
  .hr-actions {
    display: flex;
    gap: 6px;
    flex: 0 0 auto;
  }
  .hr-actions button {
    padding: 8px 10px;
  }
  .ico-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text);
  }
  .hr-actions button:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
