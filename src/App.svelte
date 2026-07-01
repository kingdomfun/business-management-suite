<script lang="ts">
  import { state as appState } from "./lib/state";
  import { readShareFromHash } from "./lib/share";
  import { startWebScheduler } from "./lib/notify";
  import { startConfigSync, configUpdated, orgConfig, configReady } from "./lib/config";
  import { unlocked, savedPassword, unlock, openWithoutGate } from "./lib/access";
  import { isBiometricSupported, hasBiometric } from "./lib/biometric";
  import { alarmTemplate } from "./lib/templates";
  import { focus, toggleFocus } from "./lib/focus";
  import { openToolId } from "./lib/tools";
  import AccessGate from "./components/AccessGate.svelte";
  import Now from "./components/Now.svelte";
  import HR from "./components/HR.svelte";
  import Business from "./components/Business.svelte";
  import Tools from "./components/Tools.svelte";
  import Settings from "./components/Settings.svelte";
  import ShareView from "./components/ShareView.svelte";
  import Icon from "./components/Icon.svelte";

  // A "#s=..." hash means we were opened via a share link → read-only viewer.
  let shared = $state(readShareFromHash(location.hash));
  $effect(() => {
    const onHash = () => (shared = readShareFromHash(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });

  type Tab = "now" | "hr" | "business" | "tools" | "settings";
  let tab = $state<Tab>("now");

  // Tapping the Tools footer button returns to the tool list if a tool is open.
  function selectTab(key: Tab) {
    if (key === "tools") openToolId.set(null);
    tab = key;
  }

  // Footer order: Focus (rendered first, below) · Schedule · Tools · HR · Business · Settings.
  const tabs: { key: Tab; ico: string; label: string }[] = [
    { key: "now", ico: "clock", label: "Schedule" },
    { key: "tools", ico: "wrench", label: "Tools" },
    { key: "hr", ico: "users", label: "HR" },
    { key: "business", ico: "chart", label: "Business" },
    { key: "settings", ico: "gear", label: "Settings" },
  ];

  // Start the web in-session scheduler that fires the hourly chime while open.
  // It reads live state + the device's resolved schedule template on each tick.
  $effect(() =>
    startWebScheduler(() => ({
      state: $appState,
      template: alarmTemplate($appState, $orgConfig, new Date()),
    }))
  );

  // Keep the public company directory (config.json) fresh across devices.
  $effect(() => startConfigSync());

  // Tab title follows the company name from the directory once it loads.
  $effect(() => {
    const name = $orgConfig.company?.name?.trim();
    document.title = name || "Business Management Suite";
  });

  // Access gate decision. Once the config has resolved:
  //  • never configured (no setupComplete, no pii) → show the setup screen so a
  //    manager can sign in with a token; a viewer can continue past it.
  //  • configured with a PII section → stay gated until unlocked, but a remembered
  //    password on a device *without* biometric unlocks silently. With biometric
  //    enrolled we always show the gate so the fingerprint/Face ID is required.
  //  • configured with no PII section → no gate → open the app.
  let gateReady = $state(false);
  $effect(() => {
    if (shared || !$configReady || $unlocked) {
      gateReady = true;
      return;
    }
    const pii = $orgConfig.pii;
    if (!$orgConfig.setupComplete && !pii) {
      gateReady = true; // first-run setup screen (rendered below)
      return;
    }
    if (!pii) {
      openWithoutGate();
      return;
    }
    const saved = savedPassword();
    if (saved && !(isBiometricSupported() && hasBiometric())) {
      // Silent unlock: keep the loading screen until it settles (success → app,
      // failure → the gate to retype).
      unlock(saved, pii.salt, pii.verifier, true).finally(() => (gateReady = true));
    } else {
      gateReady = true; // show the gate (fresh device, or biometric enrolled)
    }
  });
</script>

{#if shared}
  <ShareView payload={shared} />
{:else if !$configReady || !gateReady}
  <div class="loading"><span class="muted">Loading…</span></div>
{:else if !$unlocked && (!$orgConfig.setupComplete || $orgConfig.pii)}
  <AccessGate salt={$orgConfig.pii?.salt ?? ""} verifier={$orgConfig.pii?.verifier ?? ""} />
{:else}
  {#if $configUpdated}
    <div class="banner">
      <span>New team info available.</span>
      <button onclick={() => { selectTab("hr"); configUpdated.set(false); }}>View</button>
      <button class="x" onclick={() => configUpdated.set(false)} aria-label="Dismiss">✕</button>
    </div>
  {/if}
  <main>
    {#if tab === "now"}<Now />
    {:else if tab === "hr"}<HR />
    {:else if tab === "business"}<Business />
    {:else if tab === "tools"}<Tools />
    {:else}<Settings />{/if}
  </main>

  <nav class="tabs">
    <button class:active={$focus} onclick={toggleFocus}>
      <span class="ico">{$focus ? "◉" : "○"}</span>
      Focus
    </button>
    {#each tabs as t}
      <button class:active={tab === t.key} onclick={() => selectTab(t.key)}>
        <span class="ico"><Icon name={t.ico} /></span>
        {t.label}
      </button>
    {/each}
  </nav>
{/if}

<style>
  .loading {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: var(--accent, #2b6cb0);
    color: #fff;
    font-size: 0.85rem;
  }
  .banner span {
    flex: 1;
  }
  .banner button {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    border: none;
    padding: 6px 10px;
    border-radius: 6px;
  }
  .banner button.x {
    padding: 6px 8px;
  }
</style>
