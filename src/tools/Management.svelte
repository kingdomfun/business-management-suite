<script module lang="ts">
  export const meta = {
    name: "Management",
    icon: "users",
    description: "Edit the public company directory",
    order: 11,
    admin: true,
  };
</script>

<script lang="ts">
  import { get } from "svelte/store";
  import { state as appState, saveReport, removeReport } from "../lib/state";
  import { orgConfig } from "../lib/config";
  import { piiKey, setupAccess } from "../lib/access";
  import { encryptField, deriveKey, makeVerifier, newSalt } from "../lib/crypto";
  import { tools as allTools } from "../lib/tools";
  import {
    getPat,
    setPat,
    getRepoTarget,
    setRepoTarget,
    publishConfig,
  } from "../lib/github";
  import { sortWorkers, ROLE_LABEL } from "../lib/workers";
  import { unsavedChanges } from "../lib/nav";
  import { financeOf, computeBreakdown, money } from "../lib/finance";
  import { TEMPLATES, templateById } from "../lib/templates";
  import { toMinutes } from "../lib/schedule";
  import type { AccessConfig, Block, CalendarEvent, Employee, FinanceConfig, Holiday, OrgConfig, PlanTarget, ReserveItem, WorkerRole } from "../lib/types";

  // Managers edit a local draft, then publish it as config.json. Everything here
  // is public data — no secrets. Locally, "publish" = save the JSON to
  // public/config.json; once deployed, the same JSON is what a server request
  // would commit to source control.
  const start = get(orgConfig);
  let name = $state(start.company.name);
  let reg = $state(start.company.registrationNumber ?? "");
  let website = $state(start.company.website ?? "");
  // Built-in social channels, mirrored as plain fields. Keep these keys in sync
  // with SOCIAL_OPTIONS in HR.svelte so each gets its brand icon there.
  let discord = $state(start.company.social?.discord ?? "");
  let telegram = $state(start.company.social?.telegram ?? "");
  let linkedin = $state(start.company.social?.linkedin ?? "");
  let instagram = $state(start.company.social?.instagram ?? "");
  let facebook = $state(start.company.social?.facebook ?? "");
  let youtube = $state(start.company.social?.youtube ?? "");
  let github = $state(start.company.social?.github ?? "");
  const BUILTIN_SOCIAL = ["discord", "telegram", "linkedin", "instagram", "facebook", "youtube", "github"];

  // Custom social options / website links: any key not in BUILTIN_SOCIAL. Each is
  // a { key, url } pair the manager can name freely (e.g. "mastodon", "blog").
  let customLinks = $state<{ key: string; url: string }[]>(
    Object.entries(start.company.social ?? {})
      .filter(([key]) => !BUILTIN_SOCIAL.includes(key))
      .map(([key, url]) => ({ key, url }))
  );
  function addCustomLink() {
    customLinks = [...customLinks, { key: "", url: "" }];
  }
  function removeCustomLink(i: number) {
    customLinks = customLinks.filter((_, idx) => idx !== i);
  }

  let employees = $state<Employee[]>(structuredClone(start.employees));

  // Company-wide default schedule template (used for anyone unassigned), and the
  // company-wide holiday list. Both publish into config.json.
  let defaultTemplateId = $state(start.defaultTemplateId ?? TEMPLATES[0].id);
  let holidays = $state<Holiday[]>(structuredClone(start.holidays ?? []));
  function addHoliday() {
    holidays = [...holidays, { date: "", name: "" }];
  }
  function removeHoliday(i: number) {
    holidays = holidays.filter((_, idx) => idx !== i);
  }

  // Company appointments / special days. Each lands on its date as a block in the
  // schedules of everyone (or only the checked employees). Published encrypted.
  interface EditEvent {
    id: string;
    date: string;
    time: string;
    label: string;
    detail: string;
    employeeIds: string[]; // empty = everyone
    replacesDay: boolean;
  }
  let events = $state<EditEvent[]>(
    (start.events ?? []).map((e) => ({
      id: e.id,
      date: e.date,
      time: e.time,
      label: e.label,
      detail: e.detail ?? "",
      employeeIds: [...(e.employeeIds ?? [])],
      replacesDay: !!e.replacesDay,
    }))
  );
  function addCompanyEvent() {
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    events = [...events, { id, date: "", time: "09:00", label: "", detail: "", employeeIds: [], replacesDay: false }];
  }
  function removeCompanyEvent(i: number) {
    events = events.filter((_, idx) => idx !== i);
  }
  function toggleEventEmployee(i: number, empId: string) {
    events = events.map((e, idx) =>
      idx === i
        ? { ...e, employeeIds: e.employeeIds.includes(empId) ? e.employeeIds.filter((x) => x !== empId) : [...e.employeeIds, empId] }
        : e
    );
  }
  /** Build the publishable events list (runtime/plaintext; encrypted at publish). */
  function buildEvents(): CalendarEvent[] {
    return events
      .map((e) => {
        const ev: CalendarEvent = { id: e.id, date: e.date.trim(), time: e.time || "09:00", label: e.label.trim() };
        if (e.detail.trim()) ev.detail = e.detail.trim();
        if (e.employeeIds.length) ev.employeeIds = [...e.employeeIds];
        if (e.replacesDay) ev.replacesDay = true;
        return ev;
      })
      .filter((e) => e.date && e.label)
      .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.time) - toMinutes(b.time));
  }

  // ---- Access: manager contact + per-tool password locks ---------------------
  // managerEmail is shown on the gate's "forgot password / request access". Locks
  // password-protect non-admin tools for a scoped user (e.g. a finance officer).
  let managerEmail = $state(start.access?.managerEmail ?? "");

  // Only non-admin tools are lockable (admin tools already need the manager token).
  const lockableTools = allTools.filter((t) => !t.meta.admin);

  interface EditLock {
    id: string;
    label: string;
    tools: string[];
    salt: string;
    verifier: string;
    newPw: string; // typed to set/change the password; blank keeps the current one
  }
  let locks = $state<EditLock[]>(
    (start.access?.locks ?? []).map((l) => ({
      id: l.id,
      label: l.label,
      tools: [...l.tools],
      salt: l.salt,
      verifier: l.verifier,
      newPw: "",
    }))
  );

  function addLock() {
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    locks = [...locks, { id, label: "", tools: [], salt: "", verifier: "", newPw: "" }];
  }
  function removeLock(i: number) {
    locks = locks.filter((_, idx) => idx !== i);
  }
  function toggleLockTool(i: number, toolId: string) {
    locks = locks.map((l, idx) =>
      idx === i
        ? { ...l, tools: l.tools.includes(toolId) ? l.tools.filter((t) => t !== toolId) : [...l.tools, toolId] }
        : l
    );
  }
  /** Derive salt+verifier from the typed password so only the verifier is stored. */
  async function setLockPassword(i: number) {
    const pw = locks[i].newPw.trim();
    if (!pw) return;
    const salt = newSalt();
    const key = await deriveKey(pw, salt);
    const verifier = await makeVerifier(key);
    locks = locks.map((l, idx) => (idx === i ? { ...l, salt, verifier, newPw: "" } : l));
  }
  /** Build the access block for publishing (only locks with a password + tools). */
  function buildAccess(): AccessConfig | undefined {
    const access: AccessConfig = {};
    if (managerEmail.trim()) access.managerEmail = managerEmail.trim();
    const outLocks = locks
      .filter((l) => l.label.trim() && l.tools.length && l.salt && l.verifier)
      .map((l) => ({ id: l.id, label: l.label.trim(), tools: [...l.tools], salt: l.salt, verifier: l.verifier }));
    if (outLocks.length) access.locks = outLocks;
    return Object.keys(access).length ? access : undefined;
  }

  // Finance / budget policy (drives the Business tab + reporting tool). Bound to
  // number inputs, so these hold numbers (or null when a field is cleared).
  const startFin = financeOf(start);
  let currency = $state(startFin.currency);
  let taxPct = $state<number | null>(startFin.taxReservePct);
  let estIncome = $state<number | null>(startFin.estMonthlyIncome);
  let estVendor = $state<number | null>(startFin.estMonthlyVendor);
  let multManager = $state<number | null>(startFin.roleMultipliers.manager);
  let multSenior = $state<number | null>(startFin.roleMultipliers.senior);
  let multGeneral = $state<number | null>(startFin.roleMultipliers.general);
  let reserves = $state<ReserveItem[]>(structuredClone(startFin.reserves));

  let reserveSum = $derived(reserves.reduce((s, r) => s + (Number(r.pct) || 0), 0));

  let team = $derived(sortWorkers(employees));

  // Employee form: null = closed, "new" = adding, otherwise the id being edited.
  let mode = $state<null | "new" | string>(null);
  let fName = $state("");
  let fRole = $state<WorkerRole>("general");
  let fEmail = $state("");
  let fPhone = $state("");
  // "" = company default, a template id, or "custom" for a bespoke schedule.
  let fTemplate = $state("");

  // Custom-schedule editor rows. Checklist + planning inputs are entered as one
  // per line so each hourly step can optionally have boxes / plan fields.
  interface EditBlock {
    time: string;
    label: string;
    detail: string;
    checklistText: string;
    planText: string;
  }
  let fCustomBlocks = $state<EditBlock[]>([]);

  function blockToEdit(b: Block): EditBlock {
    return {
      time: b.time,
      label: b.label,
      detail: b.detail ?? "",
      checklistText: (b.checklist ?? []).join("\n"),
      planText: (b.plan ?? []).map((p) => `${p.label} @ ${p.time}`).join("\n"),
    };
  }
  function parsePlanLine(line: string): PlanTarget | null {
    const at = line.indexOf("@");
    if (at < 0) return null;
    const label = line.slice(0, at).trim();
    let time = line.slice(at + 1).trim();
    if (!label || !/^\d{1,2}:\d{2}$/.test(time)) return null;
    if (time.length === 4) time = "0" + time;
    return { key: label.toLowerCase().replace(/\s+/g, "-"), time, label };
  }
  function editToBlock(e: EditBlock): Block {
    const block: Block = { time: e.time, label: e.label.trim() || "Untitled" };
    if (e.detail.trim()) block.detail = e.detail.trim();
    const checklist = e.checklistText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (checklist.length) block.checklist = checklist;
    const plan = e.planText.split("\n").map(parsePlanLine).filter((p): p is PlanTarget => !!p);
    if (plan.length) block.plan = plan;
    return block;
  }
  function addCustomBlock() {
    fCustomBlocks = [...fCustomBlocks, { time: "12:00", label: "", detail: "", checklistText: "", planText: "" }];
  }
  function removeCustomBlock(i: number) {
    fCustomBlocks = fCustomBlocks.filter((_, idx) => idx !== i);
  }

  function openAdd() {
    mode = "new";
    fName = "";
    fRole = "general";
    fEmail = "";
    fPhone = "";
    fTemplate = "";
    fCustomBlocks = [];
  }
  function openEdit(id: string) {
    const w = employees.find((x) => x.id === id);
    if (!w) return;
    mode = id;
    fName = w.name;
    fRole = w.role;
    fEmail = w.email ?? "";
    fPhone = w.phone ?? "";
    if (w.customSchedule?.blocks.length) {
      fTemplate = "custom";
      fCustomBlocks = w.customSchedule.blocks.map(blockToEdit);
    } else {
      fTemplate = w.templateId ?? "";
      fCustomBlocks = [];
    }
  }
  function saveEmployee() {
    const nm = fName.trim();
    if (!nm) return;
    const useCustom = fTemplate === "custom";
    const fields = {
      name: nm,
      role: fRole,
      email: fEmail.trim() || undefined,
      phone: fPhone.trim() || undefined,
      templateId: useCustom ? undefined : fTemplate || undefined,
      customSchedule: useCustom
        ? { blocks: fCustomBlocks.map(editToBlock).sort((a, b) => toMinutes(a.time) - toMinutes(b.time)) }
        : undefined,
    };
    if (mode === "new") {
      const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
      employees = [...employees, { id, ...fields }];
    } else if (mode) {
      employees = employees.map((w) => (w.id === mode ? { ...w, ...fields } : w));
    }
    mode = null;
  }
  function removeEmployee(id: string) {
    employees = employees.filter((w) => w.id !== id);
    if (mode === id) mode = null;
  }

  // Monthly figures: managers log the actual gross income + vendor costs for a
  // chosen month. Saved device-locally to state.reports (not published) and shown
  // as "Actual" months in the Business tab. Picking a logged month loads it to edit.
  const liveFin = $derived(financeOf($orgConfig));
  let mMonth = $state("");
  let mIncome = $state<number | null>(null);
  let mVendor = $state<number | null>(null);
  let mNote = $state("");
  let loggedMonths = $derived([...$appState.reports].sort((a, b) => b.month.localeCompare(a.month)));
  let mCanSave = $derived(!!mMonth && mIncome != null && !isNaN(mIncome));
  // Live preview of the wage pool these figures would produce.
  let mPreview = $derived(
    mIncome != null && !isNaN(mIncome) ? computeBreakdown(liveFin, mIncome, mVendor ?? 0) : null
  );

  function loadMonth(key: string) {
    const r = $appState.reports.find((x) => x.month === key);
    mMonth = key;
    mIncome = r ? r.income : null;
    mVendor = r ? r.vendor : null;
    mNote = r?.note ?? "";
  }
  function saveMonth() {
    if (!mCanSave) return;
    saveReport({ month: mMonth, income: mIncome ?? 0, vendor: mVendor ?? 0, note: mNote.trim() || undefined });
  }
  function monthLabel(m: string): string {
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const [y, mo] = m.split("-");
    return names[Number(mo) - 1] ? `${names[Number(mo) - 1]} ${y}` : m;
  }

  function buildFinance(): FinanceConfig {
    const num = (v: number | null, d = 0) => (v == null || isNaN(v) ? d : v);
    return {
      currency: currency.trim() || "$",
      taxReservePct: num(taxPct),
      reserves: reserves.map((r) => ({ key: r.key, label: r.label.trim() || r.key, pct: num(r.pct) })),
      roleMultipliers: {
        manager: num(multManager, 1),
        senior: num(multSenior, 1),
        general: num(multGeneral, 1),
      },
      estMonthlyIncome: num(estIncome),
      estMonthlyVendor: num(estVendor),
    };
  }

  // Build the next config.json. Bumps version so clients detect the update.
  function buildConfig(): OrgConfig {
    const access = buildAccess();
    const publish =
      ghOwner.trim() && ghRepo.trim()
        ? {
            owner: ghOwner.trim(),
            repo: ghRepo.trim(),
            path: ghPath.trim() || "public/config.json",
            branch: ghBranch.trim() || "main",
          }
        : undefined;
    const social: Record<string, string> = {};
    if (discord.trim()) social.discord = discord.trim();
    if (telegram.trim()) social.telegram = telegram.trim();
    if (linkedin.trim()) social.linkedin = linkedin.trim();
    if (instagram.trim()) social.instagram = instagram.trim();
    if (facebook.trim()) social.facebook = facebook.trim();
    if (youtube.trim()) social.youtube = youtube.trim();
    if (github.trim()) social.github = github.trim();
    // Custom links: normalise the key to a slug, skip blanks/dupes/built-ins.
    for (const { key, url } of customLinks) {
      const k = key.trim().toLowerCase().replace(/\s+/g, "-");
      const u = url.trim();
      if (k && u && !(k in social) && !BUILTIN_SOCIAL.includes(k)) social[k] = u;
    }
    return {
      version: nextVersion,
      updatedAt: new Date().toISOString(),
      // Publishing from here means a manager is set up (has a valid token).
      setupComplete: true,
      company: {
        name: name.trim(),
        registrationNumber: reg.trim() || undefined,
        website: website.trim() || undefined,
        social: Object.keys(social).length ? social : undefined,
      },
      finance: buildFinance(),
      defaultTemplateId,
      holidays: holidays
        .map((h) => ({ date: h.date.trim(), name: h.name.trim() }))
        .filter((h) => h.date && h.name)
        .sort((a, b) => a.date.localeCompare(b.date)),
      employees,
      ...(() => {
        const evts = buildEvents();
        return evts.length ? { events: evts } : {};
      })(),
      ...(access ? { access } : {}),
      ...(publish ? { publish } : {}),
    };
  }

  // The version stamped into the published config.json. Derived from the live
  // config version (not a snapshot) so it stays correct mid-session. NOTE: never
  // surface this number in UI text or hardcode it — during local dev it tracks
  // the seed config.json (e.g. v5), which won't match what's actually published
  // to GitHub (a fresh repo starts at v1). It's an internal sync counter only.
  let nextVersion = $derived(($orgConfig.version || 0) + 1);

  // ---- PII encryption + publish ---------------------------------------------
  // Employees edit plaintext contact details here (orgConfig is decrypted once
  // unlocked); we re-encrypt phone/email before publishing because config.json
  // is public. The team access password is what derives the key. Leave the field
  // blank to keep the current password; fill it to set/rotate it (this re-keys
  // and re-encrypts all contacts on the next publish).
  let accessPw = $state("");

  /** Resolve the key + salt/verifier to publish with (rotating if accessPw set). */
  async function resolveKey(): Promise<{ key: CryptoKey; salt: string; verifier: string }> {
    const newPw = accessPw.trim();
    if (newPw) {
      const { salt, verifier } = await setupAccess(newPw);
      return { key: get(piiKey)!, salt, verifier };
    }
    const key = get(piiKey);
    const existing = get(orgConfig).pii;
    if (key && existing) return { key, salt: existing.salt, verifier: existing.verifier };
    throw new Error("Set a team access password to encrypt contact details.");
  }

  /** The config to actually publish — name/contacts/schedule encrypted, pii added. */
  async function buildPublishConfig(): Promise<OrgConfig> {
    const base = buildConfig();
    const { key, salt, verifier } = await resolveKey();
    const employees = await Promise.all(
      base.employees.map(async (e) => {
        // Rebuild the at-rest employee: id/role/links stay public; name + contacts
        // are encrypted in place; the schedule is bundled into an encrypted `sched`
        // blob (no plaintext templateId/customSchedule is published).
        const out: Employee = {
          id: e.id,
          role: e.role,
          name: e.name ? await encryptField(key, e.name) : e.name,
          email: e.email ? await encryptField(key, e.email) : undefined,
          phone: e.phone ? await encryptField(key, e.phone) : undefined,
        };
        if (e.links) out.links = e.links;
        if (e.templateId || e.customSchedule) {
          out.sched = await encryptField(
            key,
            JSON.stringify({ templateId: e.templateId, customSchedule: e.customSchedule })
          );
        }
        return out;
      })
    );
    // Dated events are private too — encrypt them into `eventsEnc`, never publish
    // the plaintext `events`.
    const { events: plainEvents, ...rest } = base;
    const out: OrgConfig = { ...rest, pii: { salt, verifier }, employees };
    if (plainEvents?.length) out.eventsEnc = await encryptField(key, JSON.stringify(plainEvents));
    return out;
  }

  async function buildPublishJson(): Promise<string> {
    return JSON.stringify(await buildPublishConfig(), null, 2);
  }

  // Preview only — masks contacts so the on-screen JSON never shows plaintext PII
  // (the real published file encrypts them). Kept synchronous for live preview.
  function previewConfig(): OrgConfig {
    const base = buildConfig();
    const hasKey = !!get(piiKey) || !!accessPw.trim();
    const tag = hasKey ? "🔒 encrypted on publish" : "⚠ needs access password";
    const mask = (v?: string) => (v ? tag : undefined);
    const employees = base.employees.map((e) => {
      const masked: Employee = { id: e.id, role: e.role, name: tag, email: mask(e.email), phone: mask(e.phone) };
      if (e.links) masked.links = e.links;
      if (e.templateId || e.customSchedule) masked.sched = tag;
      return masked;
    });
    const { events: plainEvents, ...rest } = base;
    const out: OrgConfig = { ...rest, pii: { salt: "…", verifier: "…" }, employees };
    if (plainEvents?.length) out.eventsEnc = tag;
    return out;
  }
  let json = $derived(JSON.stringify(previewConfig(), null, 2));
  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(await buildPublishJson());
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (e) {
      publishMsg = e instanceof Error ? e.message : "Couldn't build/copy the config.";
    }
  }
  async function download() {
    let out: string;
    try {
      out = await buildPublishJson();
    } catch (e) {
      publishMsg = e instanceof Error ? e.message : "Couldn't build the config.";
      return;
    }
    const blob = new Blob([out], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "config.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- GitHub publish (per-manager PAT, stored on this device only) ----------
  // Prefill from this device's saved target first, then the published config's
  // `publish` block (so a second manager inherits owner/repo), then the defaults.
  const repoStart = getRepoTarget();
  const cfgPub = start.publish;
  let ghOwner = $state(repoStart.owner || cfgPub?.owner || "");
  let ghRepo = $state(repoStart.repo || cfgPub?.repo || "business-management-suite");
  let ghPath = $state(repoStart.path || cfgPub?.path || "public/config.json");
  let ghBranch = $state(repoStart.branch || cfgPub?.branch || "main");
  let ghPat = $state(getPat());
  let publishing = $state(false);
  let publishMsg = $state("");

  function saveGitHub() {
    setRepoTarget({
      owner: ghOwner.trim(),
      repo: ghRepo.trim(),
      path: ghPath.trim() || "public/config.json",
      branch: ghBranch.trim() || "main",
    });
    setPat(ghPat.trim());
  }

  async function publishToGitHub() {
    publishing = true;
    publishMsg = "";
    try {
      saveGitHub();
      const out = await buildPublishJson();
      await publishConfig(out, "Update config.json");
      accessPw = ""; // clear after a successful rotate/publish
      publishMsg = "Published ✓ Devices pick it up within ~5 min.";
      baselineSig = contentSig(); // published state is the new clean baseline
    } catch (e) {
      publishMsg = e instanceof Error ? e.message : "Publish failed.";
    } finally {
      publishing = false;
    }
  }

  // ---- unsaved-changes tracking ----------------------------------------------
  // A signature of the draft (minus the volatile version/updatedAt). It diverges
  // from the baseline the moment the manager edits anything a Publish would save —
  // including a pending access-gate password or an unset tool-lock password. App +
  // Tools guard navigation while this is dirty (see lib/nav.ts).
  function contentSig(): string {
    return JSON.stringify({ ...buildConfig(), version: 0, updatedAt: "" });
  }
  // svelte-ignore state_referenced_locally
  let baselineSig = $state(contentSig());
  let dirty = $derived(
    contentSig() !== baselineSig ||
      accessPw.trim() !== "" ||
      locks.some((l) => l.newPw.trim() !== "")
  );
  $effect(() => {
    unsavedChanges.set(dirty);
    return () => unsavedChanges.set(false);
  });
</script>

{#if dirty}
  <div class="dirty-note">
    <span>
      {publishMsg && !publishMsg.startsWith("Published")
        ? publishMsg
        : "Unsaved changes — publish to save them."}
    </span>
    <button class="primary" disabled={publishing} onclick={publishToGitHub}>
      {publishing ? "Publishing…" : "Publish"}
    </button>
  </div>
{/if}

<div class="card">
  <details>
    <summary>Company info</summary>
    <div class="fields">
      <label for="c-name">Name</label>
      <input id="c-name" type="text" placeholder="Company name" bind:value={name} />
      <label for="c-reg">Registration number</label>
      <input id="c-reg" type="text" placeholder="e.g. 12345678" bind:value={reg} />
      <label for="c-web">Website</label>
      <input id="c-web" type="text" placeholder="https://…" bind:value={website} />
      <label for="c-discord">Discord</label>
      <input id="c-discord" type="text" placeholder="https://discord.gg/…" bind:value={discord} />
      <label for="c-telegram">Telegram</label>
      <input id="c-telegram" type="text" placeholder="https://t.me/…" bind:value={telegram} />
      <label for="c-linkedin">LinkedIn</label>
      <input id="c-linkedin" type="text" placeholder="https://linkedin.com/company/…" bind:value={linkedin} />
      <label for="c-instagram">Instagram</label>
      <input id="c-instagram" type="text" placeholder="https://instagram.com/…" bind:value={instagram} />
      <label for="c-facebook">Facebook</label>
      <input id="c-facebook" type="text" placeholder="https://facebook.com/…" bind:value={facebook} />
      <label for="c-youtube">YouTube</label>
      <input id="c-youtube" type="text" placeholder="https://youtube.com/@…" bind:value={youtube} />
      <label for="c-github">GitHub</label>
      <input id="c-github" type="text" placeholder="https://github.com/…" bind:value={github} />

      <div class="sublabel">
        Custom links
        <span class="muted" style="font-weight:400">· any other social or website</span>
      </div>
      {#each customLinks as link, i (i)}
        <div class="reserve">
          <input type="text" aria-label="Custom link {i + 1} label" placeholder="Label (e.g. blog)" bind:value={link.key} />
          <input type="text" aria-label="Custom link {i + 1} url" placeholder="https://…" bind:value={link.url} />
          <button class="sq" title="Remove link" aria-label="Remove link" onclick={() => removeCustomLink(i)}>✕</button>
        </div>
      {/each}
      <button class="add-link" onclick={addCustomLink}>+ Add custom link</button>
    </div>
  </details>
</div>

<div class="card">
  <details>
    <summary>Finance &amp; budget</summary>
    <div class="fields">
      <label for="f-cur">Currency symbol</label>
      <input id="f-cur" type="text" placeholder="$" bind:value={currency} />
      <label for="f-inc">Estimated monthly gross income</label>
      <input id="f-inc" type="number" inputmode="decimal" placeholder="50000" bind:value={estIncome} />
      <label for="f-ven">Estimated monthly vendor expenses</label>
      <input id="f-ven" type="number" inputmode="decimal" placeholder="0" bind:value={estVendor} />
      <label for="f-tax">Tax reserve (% of gross)</label>
      <input id="f-tax" type="number" inputmode="decimal" placeholder="20" bind:value={taxPct} />

      <div class="sublabel">Role multipliers</div>
      <div class="mults">
        <div>
          <label for="f-mm">Management</label>
          <input id="f-mm" type="number" inputmode="decimal" bind:value={multManager} />
        </div>
        <div>
          <label for="f-ms">Senior</label>
          <input id="f-ms" type="number" inputmode="decimal" bind:value={multSenior} />
        </div>
        <div>
          <label for="f-mg">General</label>
          <input id="f-mg" type="number" inputmode="decimal" bind:value={multGeneral} />
        </div>
      </div>

      <div class="sublabel">
        Internal reserves
        <span class="muted" style="font-weight:400">· of post-tax pool · total {reserveSum.toFixed(1)}%</span>
      </div>
      {#each reserves as r (r.key)}
        <div class="reserve">
          <input type="text" aria-label="{r.key} name" bind:value={r.label} />
          <input type="number" inputmode="decimal" aria-label="{r.key} percent" bind:value={r.pct} />
          <span class="pctmark">%</span>
        </div>
      {/each}
    </div>
  </details>
</div>

<!-- Monthly figures: log a month's actual income/expenses for the Business tab. -->
<div class="card">
  <details>
    <summary>Monthly figures</summary>
    <p class="muted note" style="margin-top:8px">
      Log a month's actual income to show real figures (not projections) on the Business tab.
      Saved on this device.
    </p>
    <div class="fields">
      <label for="m-month">Month</label>
      <input id="m-month" type="month" bind:value={mMonth} />
      <label for="m-inc">Gross income</label>
      <input id="m-inc" type="number" inputmode="decimal" placeholder="0" bind:value={mIncome} />
      <label for="m-ven">Vendor expenses</label>
      <input id="m-ven" type="number" inputmode="decimal" placeholder="0" bind:value={mVendor} />
      <label for="m-note">Note (optional)</label>
      <input id="m-note" type="text" placeholder="e.g. big launch month" bind:value={mNote} />
    </div>
    {#if mPreview}
      <div class="preview">
        <span>Worker wage pool</span><b>{money(liveFin, mPreview.wagePool)}</b>
      </div>
    {/if}
    <div class="row-actions">
      <button class="primary" disabled={!mCanSave} onclick={saveMonth}>Save month</button>
    </div>

    {#if loggedMonths.length > 0}
      <div class="sublabel" style="margin-top:14px">Logged months</div>
      {#each loggedMonths as r (r.id)}
        <div class="row">
          <button class="monthpick" class:sel={mMonth === r.month} onclick={() => loadMonth(r.month)}>
            <span class="lab">{monthLabel(r.month)}</span>
            <span class="sub">{money(liveFin, r.income)}{r.vendor ? ` · vendor ${money(liveFin, r.vendor)}` : ""}</span>
          </button>
          <div class="actions">
            <button title="Remove" aria-label="Remove month" onclick={() => removeReport(r.id)}>✕</button>
          </div>
        </div>
      {/each}
    {/if}
  </details>
</div>

<!-- Default schedule template + company-wide holidays. -->
<div class="card">
  <details>
    <summary>Schedules &amp; holidays</summary>
    <div class="fields">
      <label for="def-template">Default schedule template</label>
      <select id="def-template" bind:value={defaultTemplateId}>
        {#each TEMPLATES as t (t.id)}
          <option value={t.id}>{t.name}</option>
        {/each}
      </select>
      <p class="muted note" style="margin:6px 0 0">
        {templateById(defaultTemplateId).description}. Used for anyone without a per-person template.
      </p>

      <div class="sublabel">
        Holidays
        <span class="muted" style="font-weight:400">· company-wide days off</span>
      </div>
      {#each holidays as h, i (i)}
        <div class="reserve">
          <input type="date" aria-label="Holiday {i + 1} date" bind:value={h.date} />
          <input type="text" aria-label="Holiday {i + 1} name" placeholder="e.g. Christmas Day" bind:value={h.name} />
          <button class="sq" title="Remove holiday" aria-label="Remove holiday" onclick={() => removeHoliday(i)}>✕</button>
        </div>
      {/each}
      <button class="add-link" onclick={addHoliday}>+ Add holiday</button>

      <div class="sublabel">
        Appointments &amp; events
        <span class="muted" style="font-weight:400">· one-off items added to schedules</span>
      </div>
      <p class="muted note" style="margin:0 0 8px">
        Each lands on its date as a block on the next config fetch. Encrypted on publish.
      </p>
      {#each events as ev, i (ev.id)}
        <div class="cblock">
          <div class="crow">
            <input type="date" aria-label="Event {i + 1} date" bind:value={ev.date} />
            <input class="ctime" type="time" aria-label="Event {i + 1} time" bind:value={ev.time} />
            <button class="sq" title="Remove event" aria-label="Remove event" onclick={() => removeCompanyEvent(i)}>✕</button>
          </div>
          <input type="text" aria-label="Event {i + 1} title" placeholder="What (e.g. All-hands meeting)" bind:value={ev.label} />
          <input type="text" aria-label="Event {i + 1} detail" placeholder="Detail (optional)" bind:value={ev.detail} />
          <div class="clabel">Applies to <span class="muted" style="font-weight:400">· none checked = everyone</span></div>
          {#if team.length === 0}
            <p class="muted note" style="margin:0">Add employees below to target specific people.</p>
          {:else}
            <div class="toolpick">
              {#each team as w (w.id)}
                <label class="chk">
                  <input type="checkbox" checked={ev.employeeIds.includes(w.id)} onchange={() => toggleEventEmployee(i, w.id)} />
                  {w.name}
                </label>
              {/each}
            </div>
          {/if}
          <label class="chk" style="margin-top:4px">
            <input type="checkbox" bind:checked={ev.replacesDay} />
            Replace the normal schedule that day
          </label>
        </div>
      {/each}
      <button class="add-link" onclick={addCompanyEvent}>+ Add appointment / event</button>
    </div>
  </details>
</div>

<div class="card">
  <details open={!get(orgConfig).pii}>
    <summary>Access gate password</summary>
    <p class="muted note" style="margin:8px 0 0">
      The shared password your team enters once to open the app — it also encrypts
      contact details in the published file. {get(orgConfig).pii
        ? "One is already set. Leave blank to keep it; fill it to change it (everyone will need the new one)."
        : "Set one to turn on the team gate."}
      Changing it re-encrypts all contacts on the next Publish. Share it out-of-band; never commit it.
    </p>
    <input
      type="password"
      autocomplete="new-password"
      placeholder={get(orgConfig).pii ? "Unchanged — fill only to set/change it" : "Set the access gate password"}
      bind:value={accessPw}
    />
    {#if accessPw.trim()}
      <p class="muted note" style="margin:6px 0 0;color:var(--accent,#6aa3ff)">
        New password takes effect when you Publish below.
      </p>
    {/if}
  </details>
</div>

<div class="card">
  <details>
    <summary>Tool access &amp; locks</summary>
    <p class="muted note" style="margin-top:8px">
      A contact email for the sign-in screen's <b>Forgot password</b>, plus optional
      passwords that protect individual tools for a scoped user — e.g. a finance
      officer who can open a Payroll tool but nothing else. <b>Deterrent only</b>
      (client-side gate); managers with the token bypass every lock.
    </p>

    <label for="mgr-email">Manager email <span class="muted" style="font-weight:400">· for access requests</span></label>
    <input id="mgr-email" type="email" autocomplete="email" placeholder="you@company.com" bind:value={managerEmail} />

    <div class="sublabel" style="margin-top:14px">Tool locks</div>
    {#if lockableTools.length === 0}
      <p class="muted note">No lockable tools are installed.</p>
    {/if}
    {#each locks as lock, i (lock.id)}
      <div class="cblock">
        <div class="reserve">
          <input type="text" aria-label="Role name {i + 1}" placeholder="Role / user (e.g. Finance Officer)" bind:value={lock.label} />
          <button class="sq" title="Remove role" aria-label="Remove role" onclick={() => removeLock(i)}>✕</button>
        </div>
        <div class="clabel">Tools this password unlocks</div>
        <div class="toolpick">
          {#each lockableTools as t (t.id)}
            <label class="chk">
              <input type="checkbox" checked={lock.tools.includes(t.id)} onchange={() => toggleLockTool(i, t.id)} />
              {t.meta.name}
            </label>
          {/each}
        </div>
        <div class="reserve" style="margin-top:6px">
          <input
            type="password"
            autocomplete="new-password"
            aria-label="Password for {lock.label || 'role'}"
            placeholder={lock.verifier ? "Password set — type to change" : "Set a password"}
            bind:value={lock.newPw}
          />
          <button onclick={() => setLockPassword(i)} disabled={!lock.newPw.trim()}>Set</button>
        </div>
        <p class="muted note" style="margin:4px 0 0">
          {#if lock.newPw.trim()}
            Click <b>Set</b> to apply this password, then Publish.
          {:else if lock.verifier}
            Password set ✓ · takes effect on Publish.
          {:else}
            <span style="color:#e57373">No password yet — this role won't be saved.</span>
          {/if}
        </p>
      </div>
    {/each}
    <button class="add-link" onclick={addLock}>+ Add role / lock</button>
  </details>
</div>

<div class="card">
  <details>
    <summary>Publish</summary>

    <div class="sublabel">Publish to GitHub</div>
    <p class="muted note" style="margin:4px 0 0">
      Commits <code>config.json</code> straight to your repo via a fine-grained token
      (Contents: read+write, this repo only). The token is stored on this device only.
    </p>
    <div class="fields">
      <div class="reserve">
        <input type="text" aria-label="Repo owner" placeholder="owner" bind:value={ghOwner} />
        <span class="pctmark" style="width:8px">/</span>
        <input type="text" aria-label="Repo name" placeholder="repo" bind:value={ghRepo} />
      </div>
      <input type="text" aria-label="Config path" placeholder="public/config.json" bind:value={ghPath} />
      <input type="text" aria-label="Branch" placeholder="main" bind:value={ghBranch} />
      <input
        type="password"
        autocomplete="off"
        aria-label="GitHub token"
        placeholder="github_pat_… (stored on this device)"
        bind:value={ghPat}
      />
    </div>
    <div class="actions" style="margin:10px 0 8px">
      <button onclick={saveGitHub}>Save token</button>
      <button class="primary" disabled={publishing} onclick={publishToGitHub}>
        {publishing ? "Publishing…" : "Publish"}
      </button>
    </div>
    {#if publishMsg}
      <p class="muted note" style="margin:0 0 10px;color:{publishMsg.startsWith('Published') ? 'var(--muted)' : '#e57373'}">
        {publishMsg}
      </p>
    {/if}

    <div class="sublabel" style="margin-top:6px">Or publish manually</div>
    <p class="muted note" style="margin:4px 0 8px">
      Download / copy the encrypted JSON and commit it as
      <code>{ghPath || "public/config.json"}</code> yourself. PII below is shown masked; the file encrypts it.
    </p>
    <div class="actions" style="margin-bottom:8px">
      <button onclick={download}>Download</button>
      <button class="primary" onclick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
    </div>
    <textarea readonly rows="6" onclick={(e) => e.currentTarget.select()}>{json}</textarea>
  </details>
</div>

<div class="card">
  <div class="head">
    <h3>Employees</h3>
    {#if mode === null}
      <button class="primary sq" title="Add employee" aria-label="Add employee" onclick={openAdd}>+</button>
    {/if}
  </div>

  {#if team.length === 0 && mode === null}
    <p class="muted" style="margin-bottom:0">No employees yet. Add one to populate the HR tab.</p>
  {/if}

  {#each team as w (w.id)}
    <div class="row">
      <div style="flex:1;min-width:0">
        <div class="lab">{w.name}</div>
        <div class="sub">
          {ROLE_LABEL[w.role]} · {w.customSchedule?.blocks.length
            ? "Custom schedule"
            : templateById(w.templateId || defaultTemplateId).name}{w.email ? " · " + w.email : ""}
        </div>
      </div>
      <div class="actions">
        <button title="Edit" onclick={() => openEdit(w.id)}>Edit</button>
        <button class="sq" title="Remove" aria-label="Remove" onclick={() => removeEmployee(w.id)}>✕</button>
      </div>
    </div>
  {/each}

  {#if mode !== null}
    <div class="form fields">
      <h4 style="margin:0">{mode === "new" ? "Add employee" : "Edit employee"}</h4>
      <label for="w-name">Name</label>
      <input id="w-name" type="text" placeholder="Full name" bind:value={fName} />
      <label for="w-role">Role</label>
      <select id="w-role" bind:value={fRole}>
        <option value="manager">Manager</option>
        <option value="senior">Senior staff</option>
        <option value="general">General staff</option>
      </select>
      <label for="w-template">Schedule</label>
      <select id="w-template" bind:value={fTemplate}>
        <option value="">Company default ({templateById(defaultTemplateId).name})</option>
        {#each TEMPLATES as t (t.id)}
          <option value={t.id}>{t.name}</option>
        {/each}
        <option value="custom">Custom schedule…</option>
      </select>

      {#if fTemplate === "custom"}
        <div class="custom">
          <p class="muted note" style="margin:8px 0">
            Set working hours and a day schedule for this person. Each step can optionally have a
            checklist and planning inputs.
          </p>
          {#each fCustomBlocks as cb, i (i)}
            <div class="cblock">
              <div class="crow">
                <input class="ctime" type="time" aria-label="Step {i + 1} time" bind:value={cb.time} />
                <input type="text" aria-label="Step {i + 1} label" placeholder="Label" bind:value={cb.label} />
                <button class="sq" title="Remove step" aria-label="Remove step" onclick={() => removeCustomBlock(i)}>✕</button>
              </div>
              <input type="text" aria-label="Step {i + 1} detail" placeholder="Detail (optional)" bind:value={cb.detail} />
              <label class="clabel" for="cb-check-{i}">Checklist · one per line</label>
              <textarea id="cb-check-{i}" rows="2" placeholder={"Objective set\nReviewed"} bind:value={cb.checklistText}></textarea>
              <label class="clabel" for="cb-plan-{i}">Planning inputs · one per line as “Label @ HH:MM”</label>
              <textarea id="cb-plan-{i}" rows="2" placeholder={"Primary task @ 09:00"} bind:value={cb.planText}></textarea>
            </div>
          {/each}
          <button class="add-link" onclick={addCustomBlock}>+ Add step</button>
        </div>
      {/if}
      <label for="w-email">Email</label>
      <input id="w-email" type="text" placeholder="name@company.com" bind:value={fEmail} />
      <label for="w-phone">Phone</label>
      <input id="w-phone" type="text" placeholder="555-123-4567" bind:value={fPhone} />
      <div class="row-actions">
        <button onclick={() => (mode = null)}>Cancel</button>
        <button class="primary" disabled={!fName.trim()} onclick={saveEmployee}>
          {mode === "new" ? "Add" : "Save"}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .head h3 {
    margin: 0;
  }
  .note {
    margin: 0 0 10px;
    font-size: 0.85rem;
  }
  /* Sticky "unsaved changes" reminder at the top of the tool. */
  .dirty-note {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    margin-bottom: 12px;
    background: var(--accent-dim);
    border: 1px solid var(--accent);
    border-radius: 10px;
    font-size: 0.85rem;
  }
  .dirty-note span {
    flex: 1;
  }
  .dirty-note button {
    flex: 0 0 auto;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex: 0 0 auto;
  }
  .actions button {
    padding: 8px 10px;
  }
  /* Fixed square so +/✕ are identical regardless of glyph width. */
  .sq {
    width: 34px;
    height: 34px;
    padding: 0;
    font-size: 1.15rem;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  /* Stacked label/input pairs with consistent, tight spacing. */
  .fields {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .fields label {
    margin-top: 6px;
  }
  details summary {
    cursor: pointer;
    font-weight: 600;
    user-select: none;
  }
  /* Monthly figures: live wage-pool preview + logged-month picker rows. */
  .preview {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface-2);
    border-radius: 10px;
    padding: 9px 12px;
    margin-top: 12px;
    font-weight: 600;
  }
  .preview b {
    font-variant-numeric: tabular-nums;
  }
  .monthpick {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
    background: none;
    border: none;
    border-radius: 8px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .monthpick.sel {
    background: var(--accent-dim);
  }
  .monthpick .sub {
    font-size: 0.8rem;
    color: var(--muted);
  }
  /* Finance editor: section heading inside the .fields stack. */
  .sublabel {
    margin-top: 12px;
    font-size: 0.85rem;
    color: var(--muted);
    font-weight: 600;
  }
  .mults {
    display: flex;
    gap: 8px;
  }
  .mults > div {
    flex: 1;
  }
  .mults label {
    margin-top: 0;
  }
  .reserve {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .reserve input[type="text"] {
    flex: 1 1 auto;
  }
  .reserve input[type="number"] {
    width: 72px;
    flex: 0 0 auto;
  }
  .pctmark {
    color: var(--muted);
    width: 14px;
  }
  .add-link {
    margin-top: 6px;
    align-self: flex-start;
    font-size: 0.85rem;
  }
  .form {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }
  /* Custom per-employee schedule editor */
  .cblock {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px;
    margin-bottom: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .crow {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .crow input[type="text"],
  .crow input[type="date"] {
    flex: 1 1 auto;
    min-width: 0;
  }
  .ctime {
    width: auto;
    flex: 0 0 auto;
  }
  .clabel {
    font-size: 0.78rem;
    color: var(--muted);
    margin-top: 2px;
  }
  .toolpick {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 2px;
  }
  .chk {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    margin-top: 0;
  }
  .chk input {
    width: auto;
    margin: 0;
  }
  .cblock textarea {
    width: 100%;
    box-sizing: border-box;
    font-size: 0.85rem;
    resize: vertical;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: monospace;
    font-size: 0.75rem;
    resize: vertical;
  }
  code {
    font-size: 0.8rem;
  }
</style>
