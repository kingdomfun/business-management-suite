<script lang="ts">
  // Full-screen access gate. Nothing else in the app renders until it's cleared.
  //
  // Two ways in:
  //   • Team member — the shared access password (or device biometric). It derives
  //     the key that decrypts employee contact details from the public config.json.
  //   • Manager setup — a GitHub access token (PAT). This is the bootstrap path for
  //     a freshly-forked app: the seed config.json carries a pii block whose password
  //     the forker can't know, so a manager signs in with their token instead, then
  //     sets their own access-gate password from the management tools. Signing in
  //     this way opens the app with PII still locked (no password yet) — that's
  //     expected until they publish a config with their own password.
  import { unlock, verifyPassword, savedPassword, openWithoutGate } from "../lib/access";
  import { adminUnlock } from "../lib/state";
  import { getPat, setPat, looksLikePat, validatePat } from "../lib/github";
  import { orgConfig } from "../lib/config";
  import {
    isBiometricSupported,
    hasBiometric,
    registerBiometric,
    verifyBiometric,
  } from "../lib/biometric";

  // salt + verifier come from the published config.json (config.pii); absent in
  // first-run `setup` mode, where there's no access password to check yet.
  let {
    salt = "",
    verifier = "",
    setup = false,
  }: { salt?: string; verifier?: string; setup?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let mode = $state<"password" | "admin" | "request">(setup ? "admin" : "password");

  // Access-request ("forgot password") state — emails the manager for the password.
  let requesterName = $state("");
  let managerEmail = $derived($orgConfig.access?.managerEmail?.trim() ?? "");

  function sendRequest() {
    const company = $orgConfig.company?.name?.trim() || "the app";
    const subject = `Access request — ${company}`;
    const body =
      `Hi,\n\nCould you share the access password for ${company}` +
      (requesterName.trim() ? `?\n\nName: ${requesterName.trim()}\n` : `?\n`);
    location.href =
      `mailto:${encodeURIComponent(managerEmail)}` +
      `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  let password = $state("");
  let error = $state("");
  let busy = $state(false);
  // After a correct password, offer to enrol this device's biometric before we
  // commit the unlock (committing unmounts this gate).
  let offerEnrol = $state(false);
  let pending = ""; // the validated password held until enrol choice / commit

  // Manager-setup (PAT) mode.
  let pat = $state("");
  let showHelp = $state(false);

  const saved = savedPassword();
  const canBiometric = isBiometricSupported() && hasBiometric() && !!saved;
  const canEnrol = isBiometricSupported() && !hasBiometric();

  function switchMode(next: "password" | "admin" | "request") {
    mode = next;
    error = "";
  }

  /** Commit the unlock with the validated password (derives + holds the key). */
  async function commit() {
    await unlock(pending, salt, verifier, true);
    // `unlocked` flips → App stops rendering this gate.
  }

  async function tryPassword() {
    busy = true;
    error = "";
    const ok = await verifyPassword(password, salt, verifier);
    if (!ok) {
      busy = false;
      password = "";
      error = "Incorrect access password.";
      return;
    }
    pending = password;
    password = "";
    if (canEnrol) {
      busy = false;
      offerEnrol = true;
    } else {
      await commit();
    }
  }

  async function unlockBiometric() {
    busy = true;
    error = "";
    const ok = await verifyBiometric();
    if (ok && saved) {
      await unlock(saved, salt, verifier, true);
    } else {
      busy = false;
      error = "Biometric unlock failed or was cancelled.";
    }
  }

  async function enrol() {
    busy = true;
    await registerBiometric("access");
    await commit();
  }

  /** Manager bootstrap: validate + save the PAT, unlock admin, open the app. */
  async function tryPat() {
    const value = pat.trim();
    if (!looksLikePat(value)) {
      error = "That doesn't look like a GitHub token (starts with github_pat_ or ghp_).";
      return;
    }
    busy = true;
    error = "";
    const { ok, reason } = await validatePat(value);
    if (!ok) {
      busy = false;
      pat = "";
      error = reason ?? "GitHub rejected this token.";
      return;
    }
    setPat(value);
    adminUnlock();
    openWithoutGate(); // opens the app; PII stays locked until a password is set
  }

  /** First-run only: enter the app as a plain viewer without setting anything up. */
  function continueAsViewer() {
    openWithoutGate();
  }
</script>

<div class="gate-screen">
  <div class="gate card">
    {#if offerEnrol}
      <h3>Enable quick unlock?</h3>
      <p class="muted" style="margin-top:0;font-size:.85rem">
        Use this device's fingerprint or Face ID next time instead of typing the password.
      </p>
      <button class="primary" disabled={busy} onclick={enrol} style="width:100%">
        Enable biometric
      </button>
      <div style="height:8px"></div>
      <button disabled={busy} onclick={commit} style="width:100%">Skip</button>
    {:else if mode === "admin"}
      <h3 style="margin-top:0">{setup ? "Set up this app" : "Manager setup"}</h3>
      <p class="muted" style="margin-top:0;font-size:.85rem">
        {setup
          ? "First time here? Sign in with your GitHub access token to configure the app. Team members can continue without setting up."
          : "Sign in with your GitHub access token to set this app up. Afterwards, set an access-gate password for your team from the management tools."}
      </p>

      <div class="lbl-row">
        <label for="access-pat">GitHub access token</label>
        <button type="button" class="link" onclick={() => (showHelp = !showHelp)}>What's this?</button>
      </div>
      <input
        id="access-pat"
        type="password"
        autocomplete="off"
        bind:value={pat}
        onkeydown={(e) => e.key === "Enter" && pat && tryPat()}
        placeholder="github_pat_…"
      />

      {#if showHelp}
        <div class="help">
          <p style="margin:0 0 6px">
            A <b>fine-grained personal access token</b> lets you publish the directory
            straight from your phone — no separate login.
          </p>
          <ol style="margin:0 0 6px;padding-left:18px">
            <li>Open <b>Settings → Developer settings → Fine-grained tokens</b>.</li>
            <li><b>Generate new token</b>, Repository access: <b>only this repo</b>.</li>
            <li>Permissions: <b>Contents → Read and write</b>.</li>
            <li>Copy the <code>github_pat_…</code> value and paste it above.</li>
          </ol>
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
            Create a token on GitHub ↗
          </a>
        </div>
      {/if}

      <div style="height:10px"></div>
      <button class="primary" disabled={busy || !pat} onclick={tryPat} style="width:100%">
        {busy ? "Checking…" : "Sign in"}
      </button>
      <div style="height:8px"></div>
      {#if setup}
        <button disabled={busy} onclick={continueAsViewer} style="width:100%">
          Continue without signing in
        </button>
      {:else}
        <button disabled={busy} onclick={() => switchMode("password")} style="width:100%">
          Back
        </button>
      {/if}
    {:else if mode === "request"}
      <h3 style="margin-top:0">Request access</h3>
      {#if managerEmail}
        <p class="muted" style="margin-top:0;font-size:.85rem">
          Email your manager to ask for the access password. Add your name so they
          know who's asking.
        </p>
        <label for="req-name">Your name</label>
        <input id="req-name" type="text" bind:value={requesterName} placeholder="Your name" />
        <div style="height:10px"></div>
        <button class="primary" onclick={sendRequest} style="width:100%">
          Email {managerEmail}
        </button>
      {:else}
        <p class="muted" style="margin-top:0;font-size:.85rem">
          No manager contact is set for this app yet. Ask your manager directly for the
          access password.
        </p>
      {/if}
      <div style="height:8px"></div>
      <button onclick={() => switchMode("password")} style="width:100%">Back</button>
    {:else}
      <h3 style="margin-top:0">Enter access password</h3>
      <p class="muted" style="margin-top:0;font-size:.85rem">
        This app is for team members. Enter the shared password to continue — it's
        saved to this device so you only do this once.
      </p>

      {#if canBiometric}
        <button class="primary" disabled={busy} onclick={unlockBiometric} style="width:100%">
          Unlock with biometrics
        </button>
        <div class="gate-or">or</div>
      {/if}

      <label for="access-pw">Access password</label>
      <input
        id="access-pw"
        type="password"
        autocomplete="current-password"
        bind:value={password}
        onkeydown={(e) => e.key === "Enter" && password && tryPassword()}
        placeholder="••••••••"
      />
      <div style="height:10px"></div>
      <button class="primary" disabled={busy || !password} onclick={tryPassword} style="width:100%">
        {busy ? "Checking…" : "Unlock"}
      </button>

      <div class="links">
        <button type="button" class="link" onclick={() => switchMode("request")}>Forgot password?</button>
        <button type="button" class="link" onclick={() => switchMode("admin")}>First time setup</button>
      </div>
    {/if}

    {#if error}<p class="muted" style="color:#e57373;font-size:.8rem;margin-bottom:0">{error}</p>{/if}
  </div>
</div>

<style>
  .gate-screen {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: var(--bg, #111);
  }
  .gate {
    width: var(--modal-w, 360px);
    max-width: 100%;
    margin: 0;
  }
  .gate-or {
    text-align: center;
    color: var(--muted);
    font-size: 0.8rem;
    margin: 10px 0;
  }
  .lbl-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent, #6aa3ff);
    font-size: 0.78rem;
    cursor: pointer;
    text-decoration: underline;
    width: auto;
  }
  .links {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 12px;
  }
  .help {
    margin-top: 8px;
    padding: 10px 12px;
    background: var(--surface-2, #1a1d24);
    border-radius: 10px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .help code {
    font-size: 0.75rem;
  }
  .help a {
    color: var(--accent, #6aa3ff);
    font-size: 0.8rem;
  }
</style>
