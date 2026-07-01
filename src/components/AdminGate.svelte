<script lang="ts">
  import { adminUnlock } from "../lib/state";
  import { getPat, setPat, looksLikePat, validatePat } from "../lib/github";
  import {
    isBiometricSupported,
    hasBiometric,
    registerBiometric,
    verifyBiometric,
  } from "../lib/biometric";

  let { onClose }: { onClose: () => void } = $props();

  let pat = $state("");
  let error = $state("");
  let busy = $state(false);
  // After a valid token we offer to enrol the device biometric for next time.
  let offerEnrol = $state(false);
  let showHelp = $state(false);

  // Biometric quick-unlock only makes sense once a token is already saved on this
  // device — the biometric re-authorises showing the tools, it doesn't recreate
  // the token. Enrolment is offered on any device that supports it but hasn't yet.
  const canBiometric = isBiometricSupported() && hasBiometric() && !!getPat();
  const canEnrol = isBiometricSupported() && !hasBiometric();

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
    // Store it here so the Publish section is pre-filled and nothing has to be
    // re-entered. Possession of the token is the real write authority.
    setPat(value);
    busy = false;
    pat = "";
    if (canEnrol) offerEnrol = true; // unlock after the enrol choice
    else finish();
  }

  async function unlockBiometric() {
    busy = true;
    error = "";
    const ok = await verifyBiometric();
    busy = false;
    if (ok) finish();
    else error = "Biometric unlock failed or was cancelled.";
  }

  async function enrol() {
    busy = true;
    await registerBiometric("admin");
    busy = false;
    finish();
  }

  function finish() {
    adminUnlock();
    onClose();
  }
</script>

<div
  class="gate-backdrop"
  role="button"
  tabindex="0"
  onclick={onClose}
  onkeydown={(e) => e.key === "Escape" && onClose()}
></div>

<div class="gate card" role="dialog" aria-modal="true" aria-label="Admin sign-in">
  {#if offerEnrol}
    <h3>Enable quick unlock?</h3>
    <p class="muted" style="margin-top:0;font-size:.85rem">
      Use this device's fingerprint or Face ID next time instead of pasting the token.
    </p>
    <button class="primary" disabled={busy} onclick={enrol}>Enable biometric</button>
    <button disabled={busy} onclick={finish}>Skip</button>
  {:else}
    <h3>Admin sign-in</h3>
    <p class="muted" style="margin-top:0;font-size:.85rem">
      Management tools unlock with your GitHub access token — the same token that
      publishes the directory. It's stored on this device only.
    </p>

    {#if canBiometric}
      <button class="primary" disabled={busy} onclick={unlockBiometric} style="width:100%">
        Unlock with biometrics
      </button>
      <div class="gate-or">or</div>
    {/if}

    <div class="lbl-row">
      <label for="admin-pat">GitHub access token</label>
      <button type="button" class="whats" onclick={() => (showHelp = !showHelp)}>What's this?</button>
    </div>
    <input
      id="admin-pat"
      class="big"
      type="password"
      autocomplete="off"
      bind:value={pat}
      onkeydown={(e) => e.key === "Enter" && tryPat()}
      placeholder="github_pat_…"
    />

    {#if showHelp}
      <div class="help">
        <p style="margin:0 0 6px">
          A <b>fine-grained personal access token</b> lets you publish the company
          directory straight from your phone — no separate login.
        </p>
        <ol style="margin:0 0 6px;padding-left:18px">
          <li>Open <b>Settings → Developer settings → Fine-grained tokens</b>.</li>
          <li><b>Generate new token</b>, Repository access: <b>only this repo</b>.</li>
          <li>Permissions: <b>Contents → Read and write</b>.</li>
          <li>Copy the <code>github_pat_…</code> value and paste it above.</li>
        </ol>
        <a
          href="https://github.com/settings/personal-access-tokens/new"
          target="_blank"
          rel="noopener noreferrer">Create a token on GitHub ↗</a
        >
      </div>
    {/if}

    <div style="height:10px"></div>
    <div class="row-actions">
      <button onclick={onClose}>Cancel</button>
      <button class="primary" disabled={busy || !pat} onclick={tryPat}>
        {busy ? "Checking…" : "Unlock"}
      </button>
    </div>
  {/if}

  {#if error}<p class="muted" style="color:#e57373;font-size:.8rem;margin-bottom:0">{error}</p>{/if}
</div>

<style>
  .gate-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 50;
  }
  .gate {
    position: fixed;
    z-index: 51;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: var(--modal-w);
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
    margin-bottom: 6px;
  }
  /* Larger, full-width token field (overrides the global input padding). */
  .big {
    width: 100%;
    padding: 15px 16px;
    font-size: 1.05rem;
  }
  .whats {
    flex: 0 0 auto;
    white-space: nowrap;
    background: none;
    border: none;
    padding: 0;
    color: var(--accent, #6aa3ff);
    font-size: 0.78rem;
    cursor: pointer;
    text-decoration: underline;
    width: auto;
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
