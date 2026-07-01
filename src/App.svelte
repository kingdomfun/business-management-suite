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
  import { unsavedChanges, pendingLeave, requestLeave, confirmLeave, cancelLeave } from "./lib/nav";
  import { canInstall, iosInstall, installDismissed, promptInstall, dismissInstall } from "./lib/install";
  import { get } from "svelte/store";
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
  // Routed through the unsaved-changes guard so an open editor (Management) can
  // prompt before its draft is discarded.
  function selectTab(key: Tab) {
    requestLeave(() => {
      if (key === "tools") openToolId.set(null);
      tab = key;
    });
  }

  // Warn on a real page leave (refresh / close / hardware back out of the app)
  // while there are unpublished edits. The in-app modal handles tab/tool navigation.
  $effect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (get(unsavedChanges)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  });

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
  {#if !$installDismissed && ($canInstall || $iosInstall)}
    <div class="install-banner">
      {#if $canInstall}
        <span>Add this app to your device for quick, offline access.</span>
        <button class="i-btn" onclick={promptInstall}>Install</button>
      {:else}
        <span>To install: tap <b>Share</b>, then <b>Add to Home Screen</b>.</span>
      {/if}
      <button class="i-x" onclick={dismissInstall} aria-label="Dismiss install banner">✕</button>
    </div>
  {/if}
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

{#if $pendingLeave}
  <div class="leave-backdrop" role="button" tabindex="0"
    onclick={cancelLeave} onkeydown={(e) => e.key === "Escape" && cancelLeave()}></div>
  <div class="leave-modal card" role="dialog" aria-modal="true" aria-label="Unsaved changes">
    <h3 style="margin-top:0">Unsaved changes</h3>
    <p class="muted" style="margin-top:0;font-size:.9rem">
      You've edited the directory but haven't published yet. Leave now and those
      changes will be lost.
    </p>
    <div class="leave-actions">
      <button onclick={confirmLeave}>Leave without publishing</button>
      <button class="primary" onclick={cancelLeave}>Keep editing</button>
    </div>
  </div>
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
  .install-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .install-banner span {
    flex: 1;
  }
  .install-banner .i-btn {
    flex: 0 0 auto;
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
  }
  .install-banner .i-x {
    flex: 0 0 auto;
    background: none;
    border: none;
    color: var(--muted);
    padding: 6px 8px;
  }
  .leave-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 60;
  }
  .leave-modal {
    position: fixed;
    z-index: 61;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: var(--modal-w);
    margin: 0;
  }
  .leave-actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }
  .leave-actions button {
    flex: 1 1 0;
    min-width: 0;
  }
</style>
