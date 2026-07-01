<script lang="ts">
  import { state as appState } from "../lib/state";
  import { tools, openToolId } from "../lib/tools";
  import { orgConfig } from "../lib/config";
  import { unlockedLocks, pendingLock } from "../lib/locks";
  import { requestLeave } from "../lib/nav";
  import type { ToolLock } from "../lib/types";
  import Icon from "./Icon.svelte";
  import AdminGate from "./AdminGate.svelte";
  import LockGate from "./LockGate.svelte";

  let gateFor = $state<string | null>(null); // tool id awaiting admin unlock
  let lockGateFor = $state<{ id: string; lock: ToolLock } | null>(null);
  let open = $derived(tools.find((t) => t.id === $openToolId) ?? null);
  let unlocked = $derived($appState.manage.signedIn);

  /** The lock still guarding a tool (null = openable), reactive to config + unlocks. */
  function guard(id: string): ToolLock | null {
    return pendingLock($orgConfig, id, unlocked, $unlockedLocks);
  }

  function select(id: string, admin: boolean) {
    if (admin && !unlocked) {
      gateFor = id;
      return;
    }
    const lock = guard(id);
    if (lock) {
      lockGateFor = { id, lock };
      return;
    }
    openToolId.set(id);
  }
  function onCloseGate() {
    // Fires on both success and cancel — only open the tool if actually unlocked.
    if (gateFor && $appState.manage.signedIn) openToolId.set(gateFor);
    gateFor = null;
  }
  function onCloseLock(unlockedOk: boolean) {
    if (unlockedOk && lockGateFor) openToolId.set(lockGateFor.id);
    lockGateFor = null;
  }
</script>

{#if open}
  {@const Tool = open.Component}
  <div class="tool-banner">
    <button class="tool-back" onclick={() => requestLeave(() => openToolId.set(null))}>
      <span class="chev">‹</span> Tools
    </button>
    <span class="tool-banner-name">
      <Icon name={open.meta.icon ?? "tool"} size={18} />
      {open.meta.name}
    </span>
  </div>
  <Tool />
{:else if tools.length === 0}
  <div class="card"><p class="muted">No tools installed yet.</p></div>
{:else}
  <div class="card">
    {#each tools as t (t.id)}
      {@const locked = (!!t.meta.admin && !unlocked) || !!guard(t.id)}
      <div
        class="tool-item"
        role="button"
        tabindex="0"
        onclick={() => select(t.id, !!t.meta.admin)}
        onkeydown={(e) => e.key === "Enter" && select(t.id, !!t.meta.admin)}
      >
        <div class="tool-ico"><Icon name={t.meta.icon ?? "tool"} /></div>
        <div class="tool-main">
          <div class="lab">{t.meta.name}</div>
          {#if t.meta.description}<div class="tool-desc">{t.meta.description}</div>{/if}
        </div>
        <div class="tool-trail">
          {#if locked}
            <Icon name="lock" size={18} />
          {:else}
            <span style="color:var(--muted)">›</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if gateFor}
  <AdminGate onClose={onCloseGate} />
{/if}

{#if lockGateFor}
  <LockGate lock={lockGateFor.lock} onClose={onCloseLock} />
{/if}

<style>
  /* List item: icon + (name above its full description) + trailing chevron. */
  .tool-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
  }
  .tool-item:last-child {
    border-bottom: none;
  }
  .tool-ico {
    flex: 0 0 auto;
    width: 24px;
    color: var(--muted);
    display: flex;
    align-items: center;
  }
  .tool-main {
    flex: 1 1 auto;
    min-width: 0;
  }
  .tool-item .lab {
    font-weight: 600;
  }
  .tool-desc {
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1.35;
    margin-top: 2px;
  }
  .tool-trail {
    flex: 0 0 auto;
    color: var(--muted);
    display: flex;
    align-items: center;
  }

  /* Back banner: a centered bar (same width as the modals/footer) with the
     footer's background, rounded bottom corners, and a back button on the left.
     The icon + title are centered. */
  .tool-banner {
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
  .tool-back {
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
  .tool-back .chev {
    font-size: 1.2rem;
    line-height: 1;
  }
  .tool-banner-name {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text);
    font-weight: 600;
  }
</style>
