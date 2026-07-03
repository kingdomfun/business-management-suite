<script lang="ts">
    import {
        state as appState,
        addEvent,
        updateEvent,
        removeEvent,
    } from "../lib/state";
    import { dateKey } from "../lib/schedule";

    // A self-contained editor for the device's own one-off appointments. Used on
    // the Settings tab and in the Now tab's end-of-day plan block. Entries are
    // edited inline (like the off-hours block editor). `defaultDate` seeds a newly
    // added appointment's date (e.g. tomorrow when planning ahead).
    let { defaultDate = "" }: { defaultDate?: string } = $props();

    let events = $derived($appState.events ?? []);

    function add() {
        addEvent({
            date: defaultDate || dateKey(new Date()),
            time: "09:00",
            label: "",
        });
    }
</script>

{#each events as e (e.id)}
    <div class="cblock">
        <div class="crow">
            <input
                type="date"
                aria-label="Appointment date"
                value={e.date}
                onchange={(ev) =>
                    updateEvent(e.id, { date: ev.currentTarget.value })}
            />
            <input
                class="ctime"
                type="time"
                aria-label="Appointment time"
                value={e.time}
                onchange={(ev) =>
                    updateEvent(e.id, { time: ev.currentTarget.value })}
            />
            <button
                class="sq"
                title="Remove appointment"
                aria-label="Remove appointment"
                onclick={() => removeEvent(e.id)}>✕</button
            >
        </div>
        <input
            type="text"
            aria-label="Appointment title"
            placeholder="What (e.g. Client Meeting)"
            value={e.label}
            oninput={(ev) =>
                updateEvent(e.id, { label: ev.currentTarget.value })}
        />
        <input
            type="text"
            aria-label="Appointment detail"
            placeholder="Detail (optional)"
            value={e.detail ?? ""}
            oninput={(ev) =>
                updateEvent(e.id, { detail: ev.currentTarget.value })}
        />
        <label class="chk">
            <input
                type="checkbox"
                checked={!!e.replacesDay}
                onchange={(ev) =>
                    updateEvent(e.id, {
                        replacesDay: ev.currentTarget.checked,
                    })}
            />
            All-day event (replaces the day's schedule)
        </label>
    </div>
{/each}

<button class="add-link" onclick={add}>+ Add appointment</button>
{#if events.length === 0}
    <p class="muted hint">No appointments yet.</p>
{/if}

<style>
    /* Mirrors the custom-schedule / company-event editors so all one-off editors
     read as one family. */
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
    .crow input[type="date"] {
        flex: 1 1 auto;
        min-width: 0;
    }
    .ctime {
        width: auto;
        flex: 0 0 auto;
    }
    .chk {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85rem;
        color: var(--muted);
    }
    .chk input {
        width: auto;
        flex: 0 0 auto;
        margin: 0;
    }
    .sq {
        width: 34px;
        height: 34px;
        padding: 0;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .add-link {
        align-self: flex-start;
        font-size: 0.85rem;
    }
    .hint {
        font-size: 0.78rem;
        margin: 8px 0 0;
    }
</style>
