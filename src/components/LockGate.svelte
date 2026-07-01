<script lang="ts">
  // Password prompt for a single tool lock (see lib/locks.ts). Mirrors AdminGate's
  // shape but checks a config-defined lock verifier instead of a GitHub token.
  import type { ToolLock } from "../lib/types";
  import { tryUnlockLock } from "../lib/locks";

  let { lock, onClose }: { lock: ToolLock; onClose: (unlocked: boolean) => void } = $props();

  let password = $state("");
  let error = $state("");
  let busy = $state(false);

  async function submit() {
    if (!password) return;
    busy = true;
    error = "";
    const ok = await tryUnlockLock(lock, password);
    busy = false;
    password = "";
    if (ok) onClose(true);
    else error = "Incorrect password.";
  }
</script>

<div
  class="gate-backdrop"
  role="button"
  tabindex="0"
  onclick={() => onClose(false)}
  onkeydown={(e) => e.key === "Escape" && onClose(false)}
></div>

<div class="gate card" role="dialog" aria-modal="true" aria-label="Tool locked">
  <h3 style="margin-top:0">{lock.label || "Locked tool"}</h3>
  <p class="muted" style="margin-top:0;font-size:.85rem">
    This tool is password-protected. Enter the password for “{lock.label}” to open it.
  </p>

  <label for="lock-pw">Password</label>
  <input
    id="lock-pw"
    type="password"
    autocomplete="off"
    bind:value={password}
    onkeydown={(e) => e.key === "Enter" && submit()}
    placeholder="••••••••"
  />
  <div style="height:10px"></div>
  <div class="row-actions">
    <button onclick={() => onClose(false)}>Cancel</button>
    <button class="primary" disabled={busy || !password} onclick={submit}>
      {busy ? "Checking…" : "Unlock"}
    </button>
  </div>

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
</style>
