<script module lang="ts">
  export const meta = {
    name: "Projects",
    icon: "board",
    description: "A simple project board to track progress",
    order: 3,
  };
</script>

<script lang="ts">
  // A lightweight kanban-style project tracker. Self-contained: it persists its
  // own boards to localStorage (independent of app state), like the other tools.
  // Each project is three columns — To do / In progress / Done — and you can
  // email a progress summary to a teammate (e.g. a manager) via the device's
  // mail app, with recipients pulled from the public org directory.
  import Icon from "../components/Icon.svelte";
  import { orgConfig } from "../lib/config";
  import { sortWorkers, ROLE_LABEL } from "../lib/workers";

  type Status = "todo" | "doing" | "done";

  interface Card {
    id: string;
    title: string;
    note?: string;
    status: Status;
  }

  interface Project {
    id: string;
    name: string;
    cards: Card[];
  }

  const COLUMNS: { status: Status; label: string }[] = [
    { status: "todo", label: "To do" },
    { status: "doing", label: "In progress" },
    { status: "done", label: "Done" },
  ];

  const KEY = "tool-projects-v1";

  function uid(): string {
    return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
  }

  function load(): { projects: Project[]; activeId: string } {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw) as { projects: Project[]; activeId: string };
        if (data.projects?.length) return data;
      }
    } catch {
      /* fall through to a fresh board */
    }
    const first: Project = { id: uid(), name: "My project", cards: [] };
    return { projects: [first], activeId: first.id };
  }

  const initial = load();
  let projects = $state<Project[]>(initial.projects);
  let activeId = $state(initial.activeId);

  $effect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ projects, activeId }));
    } catch {
      /* storage full / unavailable — ignore */
    }
  });

  let active = $derived(projects.find((p) => p.id === activeId) ?? projects[0]);
  let total = $derived(active ? active.cards.length : 0);
  let doneCount = $derived(active ? active.cards.filter((c) => c.status === "done").length : 0);
  let pct = $derived(total ? Math.round((doneCount / total) * 100) : 0);

  function cardsIn(status: Status): Card[] {
    return active ? active.cards.filter((c) => c.status === status) : [];
  }

  // ---- project management ----
  function addProject() {
    const name = (newProjectName.trim() || "Untitled project").slice(0, 80);
    const p: Project = { id: uid(), name, cards: [] };
    projects.push(p);
    activeId = p.id;
    newProjectName = "";
  }
  let newProjectName = $state("");

  function renameProject() {
    const name = prompt("Rename project", active?.name ?? "");
    if (name && active) active.name = name.trim().slice(0, 80);
  }

  function deleteProject() {
    if (!active) return;
    if (!confirm(`Delete "${active.name}" and all its tasks?`)) return;
    projects = projects.filter((p) => p.id !== active!.id);
    if (!projects.length) {
      const p: Project = { id: uid(), name: "My project", cards: [] };
      projects.push(p);
    }
    activeId = projects[0].id;
  }

  // ---- card management ----
  let newCard = $state("");
  function addCard() {
    const title = newCard.trim();
    if (!title || !active) return;
    active.cards.push({ id: uid(), title: title.slice(0, 200), status: "todo" });
    newCard = "";
  }

  // Index of the column a status sits in, so we can move a card left/right.
  function colIndex(status: Status): number {
    return COLUMNS.findIndex((c) => c.status === status);
  }
  function move(card: Card, dir: -1 | 1) {
    const i = colIndex(card.status) + dir;
    if (i >= 0 && i < COLUMNS.length) card.status = COLUMNS[i].status;
  }
  function removeCard(card: Card) {
    if (!active) return;
    active.cards = active.cards.filter((c) => c.id !== card.id);
  }

  // ---- email progress report ----
  let showReport = $state(false);
  let extra = $state(""); // free-form note added to the top of the report

  // Everyone in the directory, sorted owner → managers → senior → general, as the
  // dropdown of report recipients. `pick` holds the chosen email, "" (none), or
  // "__custom__" to type an address not on file.
  let recipients = $derived(sortWorkers($orgConfig.employees));
  let pick = $state("");
  let customTo = $state("");
  let to = $derived(pick === "__custom__" ? customTo.trim() : pick);

  function buildReport(): string {
    if (!active) return "";
    const lines: string[] = [];
    if (extra.trim()) lines.push(extra.trim(), "");
    lines.push(`Progress report — ${active.name}`);
    lines.push(`${doneCount} of ${total} done (${pct}%)`);
    lines.push("");
    for (const col of COLUMNS) {
      const items = active.cards.filter((c) => c.status === col.status);
      if (!items.length) continue;
      lines.push(`${col.label} (${items.length}):`);
      for (const c of items) lines.push(`  • ${c.title}${c.note ? ` — ${c.note}` : ""}`);
      lines.push("");
    }
    return lines.join("\n").trimEnd();
  }

  function sendReport() {
    const subject = `Progress report: ${active?.name ?? "project"}`;
    location.href =
      `mailto:${encodeURIComponent(to.trim())}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(buildReport())}`;
    showReport = false;
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildReport());
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard blocked — the textarea preview is still selectable */
    }
  }
  let copied = $state(false);
</script>

<div class="card">
  <!-- project switcher -->
  <div class="proj-bar">
    <select aria-label="Project" bind:value={activeId}>
      {#each projects as p}
        <option value={p.id}>{p.name}</option>
      {/each}
    </select>
    <button class="icon-btn" title="Rename project" aria-label="Rename project" onclick={renameProject}>
      <Icon name="note" size={18} />
    </button>
    <button class="icon-btn" title="Delete project" aria-label="Delete project" onclick={deleteProject}>
      <Icon name="trash" size={18} />
    </button>
  </div>

  <div class="new-proj">
    <input
      type="text"
      placeholder="New project name…"
      bind:value={newProjectName}
      onkeydown={(e) => e.key === "Enter" && addProject()}
    />
    <button onclick={addProject}><Icon name="plus" size={16} /> Project</button>
  </div>

  {#if active}
    <!-- progress summary -->
    <div class="summary">
      <span class="muted">{doneCount}/{total} done · {pct}%</span>
      <div class="bar" aria-hidden="true"><div class="bar-fill" style="width:{pct}%"></div></div>
    </div>

    <!-- add task -->
    <div class="new-card">
      <input
        type="text"
        placeholder="Add a task…"
        bind:value={newCard}
        onkeydown={(e) => e.key === "Enter" && addCard()}
      />
      <button class="primary" onclick={addCard}><Icon name="plus" size={16} /></button>
    </div>

    <!-- columns -->
    <div class="cols">
      {#each COLUMNS as col, ci}
        <section class="col" class:done={col.status === "done"}>
          <h4>{col.label} <span class="count">{cardsIn(col.status).length}</span></h4>
          {#each cardsIn(col.status) as card (card.id)}
            <article class="task">
              <p class="title">{card.title}</p>
              <div class="task-actions">
                <button
                  class="mini"
                  disabled={ci === 0}
                  title="Move back"
                  aria-label="Move back"
                  onclick={() => move(card, -1)}>‹</button
                >
                <button
                  class="mini"
                  disabled={ci === COLUMNS.length - 1}
                  title="Move forward"
                  aria-label="Move forward"
                  onclick={() => move(card, 1)}>›</button
                >
                <button class="mini danger" title="Delete task" aria-label="Delete task" onclick={() => removeCard(card)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </article>
          {:else}
            <p class="empty muted">—</p>
          {/each}
        </section>
      {/each}
    </div>

    <!-- report -->
    <button class="report-toggle" onclick={() => (showReport = !showReport)}>
      <Icon name="mail" size={16} /> Email a progress report
    </button>

    {#if showReport}
      <div class="report">
        <label for="rep-to">Send to</label>
        <select id="rep-to" bind:value={pick}>
          <option value="" disabled>Choose who to email…</option>
          {#each recipients as r (r.id)}
            <option value={r.email ?? ""} disabled={!r.email}>
              {r.name} · {ROLE_LABEL[r.role]}{r.email ? "" : " (no email)"}
            </option>
          {/each}
          <option value="__custom__">Other email…</option>
        </select>
        {#if pick === "__custom__"}
          <div style="height:8px"></div>
          <input type="email" placeholder="name@email.com" bind:value={customTo} />
        {/if}

        <div style="height:10px"></div>
        <label for="rep-extra">Add a note (optional)</label>
        <textarea id="rep-extra" style="min-height:64px" placeholder="Anything to flag…" bind:value={extra}></textarea>

        <div style="height:10px"></div>
        <label for="rep-preview">Preview</label>
        <textarea id="rep-preview" class="preview" readonly style="min-height:140px" value={buildReport()}></textarea>

        <div class="row-actions">
          <button onclick={copyReport}>{copied ? "Copied!" : "Copy"}</button>
          <button class="primary" disabled={!to.trim()} onclick={sendReport}>
            <Icon name="send" size={15} /> Send report
          </button>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .proj-bar {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .proj-bar select {
    flex: 1;
  }
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    color: var(--muted);
  }
  .new-proj {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .new-proj input {
    flex: 1;
  }
  .new-proj button {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .summary {
    margin: 14px 0 10px;
  }
  .summary .muted {
    font-size: 0.8rem;
  }
  .bar {
    height: 6px;
    border-radius: 999px;
    background: var(--surface-2, var(--line));
    overflow: hidden;
    margin-top: 6px;
  }
  .bar-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s ease;
  }

  .new-card {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }
  .new-card input {
    flex: 1;
  }

  .cols {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  @media (min-width: 560px) {
    .cols {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .col {
    background: var(--surface-2, transparent);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px;
  }
  .col.done {
    opacity: 0.92;
  }
  .col h4 {
    margin: 2px 4px 8px;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
  }
  .col h4 .count {
    color: var(--muted);
  }

  .task {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 10px;
    margin-bottom: 6px;
  }
  .task .title {
    margin: 0 0 6px;
    font-size: 0.9rem;
    word-break: break-word;
  }
  .col.done .task .title {
    text-decoration: line-through;
    color: var(--muted);
  }
  .task-actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }
  .mini {
    padding: 2px 9px;
    font-size: 0.95rem;
    line-height: 1.2;
    min-width: 0;
  }
  .mini.danger {
    color: var(--muted);
  }
  .empty {
    text-align: center;
    font-size: 0.8rem;
    margin: 4px 0;
  }

  .report-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 16px;
    width: 100%;
    justify-content: center;
  }
  .report {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .report .preview {
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    white-space: pre;
  }
</style>
