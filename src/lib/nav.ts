// Unsaved-changes guard for in-app navigation.
//
// The Management tool edits a local draft that only persists on Publish. When that
// draft is dirty it sets `unsavedChanges`, and navigation actions (footer tabs, the
// Tools back button) route through `requestLeave` so they can be held behind a
// confirm modal (rendered in App.svelte) instead of silently discarding the edits.

import { writable, get } from "svelte/store";

/** True while an open editor (Management) has unpublished changes. */
export const unsavedChanges = writable(false);

/** A navigation deferred pending confirmation, or null when nothing is pending. */
export const pendingLeave = writable<null | (() => void)>(null);

/** Run `action` now, or defer it behind the confirm modal if there are unsaved changes. */
export function requestLeave(action: () => void): void {
  if (get(unsavedChanges)) pendingLeave.set(action);
  else action();
}

/** Confirm the pending navigation: clear the guard and run it. */
export function confirmLeave(): void {
  const action = get(pendingLeave);
  unsavedChanges.set(false);
  pendingLeave.set(null);
  action?.();
}

/** Dismiss the modal and stay put. */
export function cancelLeave(): void {
  pendingLeave.set(null);
}
