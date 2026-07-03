<script lang="ts">
  // Full-screen access gate. One clean main view; the two links open sub-views
  // (request access / first-time setup) that fall back with a Back button.
  //
  //   • Sign in — the shared access password (or a saved-device biometric). It
  //     derives the key that decrypts staff details from the public config.json.
  //   • Continue without signing in — browse with those details left locked.
  //   • Forgot password — email the manager to ask for the password.
  //   • First time setup — a manager signs in with a GitHub token to configure the
  //     app (the bootstrap path for a freshly-forked copy that has no password yet).
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

  // salt + verifier come from the published config.json (config.pii); both empty
  // on a fresh, never-configured app (no password set yet).
  let { salt = "", verifier = "" }: { salt?: string; verifier?: string } = $props();

  type View = "main" | "request" | "setup" | "enrol";
  let view = $state<View>("main");

  let password = $state("");
  let error = $state("");
  let busy = $state(false);
  let pending = ""; // the validated password held until the enrol choice / commit

  // Forgot-password (email the manager) state.
  let requesterName = $state("");
  let managerEmail = $derived($orgConfig.access?.managerEmail?.trim() ?? "");

  // First-time-setup (GitHub token) state.
  let pat = $state("");
  let showHelp = $state(false);

  const saved = savedPassword();
  const canBiometric = isBiometricSupported() && hasBiometric() && !!saved;
  const canEnrol = isBiometricSupported() && !hasBiometric();
  // A manager token may already be saved on this device (from a previous setup).
  // Surfaced in the setup view so a returning manager isn't misled into thinking
  // the token was lost just because the field starts empty.
  const patAlready = !!getPat();

  /** A returning manager whose token is already saved just continues in. */
  function continueAsManager() {
    adminUnlock();
    openWithoutGate();
  }

  function go(next: View) {
    view = next;
    error = "";
  }

  /** Commit the unlock with the validated password (derives + holds the key). */
  async function commit() {
    await unlock(pending, salt, verifier, true);
    // `unlocked` flips → App stops rendering this gate.
  }

  async function tryPassword() {
    if (!verifier) {
      error = "No access password has been set yet — use First time setup, or Continue without signing in.";
      return;
    }
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
      go("enrol");
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

  /** Enter the app without a password — staff details stay locked. */
  function continueAsViewer() {
    openWithoutGate();
  }

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
    openWithoutGate(); // opens the app; details stay locked until a password is set
  }
</script>

<div class="gate-screen">
  <div class="gate card">
    {#if view === "enrol"}
      <h3 class="gate-h">Enable quick unlock?</h3>
      <p class="muted sub">Use this device's fingerprint or Face ID next time instead of the password.</p>
      <button class="primary" disabled={busy} onclick={enrol} style="width:100%">Enable biometric</button>
      <div style="height:8px"></div>
      <button disabled={busy} onclick={commit} style="width:100%">Skip</button>
    {:else if view === "request"}
      <h3 class="gate-h">Request access</h3>
      {#if managerEmail}
        <p class="muted sub">Email your manager to ask for the access password.</p>
        <label for="req-name">Your name</label>
        <input id="req-name" type="text" bind:value={requesterName} placeholder="Your name" />
        <div style="height:10px"></div>
        <button class="primary" onclick={sendRequest} style="width:100%">Email {managerEmail}</button>
      {:else}
        <p class="muted sub">No manager contact is set for this app yet. Ask your manager directly for the access password.</p>
      {/if}
      <div style="height:8px"></div>
      <button disabled={busy} onclick={() => go("main")} style="width:100%">Back</button>
    {:else if view === "setup"}
      <h3 class="gate-h">First-time setup</h3>
      {#if patAlready}
        <p class="muted sub">
          ✓ A GitHub token is already saved on this device — you're set up. Continue, or paste a
          new token below to replace it.
        </p>
        <button class="primary" onclick={continueAsManager} style="width:100%">Continue</button>
        <div style="height:10px"></div>
      {:else}
        <p class="muted sub">Managers: sign in with your GitHub token to set up and publish this app.</p>
      {/if}

      <div class="lbl-row">
        <label for="access-pat">Token</label>
        <button type="button" class="link" onclick={() => (showHelp = !showHelp)}>What's this?</button>
      </div>
      <input
        id="access-pat"
        class="big"
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
      <button disabled={busy} onclick={() => go("main")} style="width:100%">Back</button>
    {:else}
      <h3 class="gate-h">Sign in</h3>

      {#if canBiometric}
        <button class="primary" disabled={busy} onclick={unlockBiometric} style="width:100%">
          Unlock with biometrics
        </button>
        <div class="gate-or">or</div>
      {/if}

      <input
        id="access-pw"
        class="big"
        type="password"
        autocomplete="current-password"
        bind:value={password}
        onkeydown={(e) => e.key === "Enter" && password && tryPassword()}
        placeholder="Access password"
      />
      <div class="btn-row">
        <button class="primary" disabled={busy || !password} onclick={tryPassword}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        <button disabled={busy} onclick={continueAsViewer}>Continue without signing in</button>
      </div>

      <div class="links">
        <button type="button" class="link" onclick={() => go("request")}>Forgot password</button>
        <button type="button" class="link" onclick={() => go("setup")}>First time setup</button>
      </div>
    {/if}

    {#if error}<p class="muted err">{error}</p>{/if}
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
  .gate-h {
    margin: 0 0 12px;
    text-align: center;
  }
  /* Larger, full-width credential fields (overrides the global input padding). */
  .big {
    width: 100%;
    padding: 15px 16px;
    font-size: 1.05rem;
  }
  .sub {
    margin: 0 0 12px;
    font-size: 0.85rem;
  }
  .btn-row {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .btn-row button {
    flex: 1 1 0;
    min-width: 0;
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
    margin-top: 14px;
  }
  .err {
    color: #e57373;
    font-size: 0.8rem;
    margin: 10px 0 0;
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
