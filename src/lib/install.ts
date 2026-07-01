// In-app install banner support.
//
// Browsers no longer pop up an automatic install prompt: Chrome/Android fire a
// `beforeinstallprompt` event a site must capture to show its own button, and iOS
// Safari can't be prompted programmatically at all (Share → Add to Home Screen).
// This captures the event (or flags iOS) so App.svelte can show a banner — and does
// nothing when the app is already running as an installed PWA (standalone).

import { writable } from "svelte/store";

const DISMISS_KEY = "install-banner-dismissed-v1";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

/** True once Chrome/Android offers a native install (event captured). */
export const canInstall = writable(false);
/** True on iOS Safari (no programmatic prompt) → show the Share → A2HS hint. */
export const iosInstall = writable(false);
/** True once the user dismisses the banner (persisted on this device). */
export const installDismissed = writable(loadDismissed());

function loadDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Already installed / launched from the home screen? Then there's nothing to offer. */
function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as a Mac; detect the touch-capable "Mac".
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadOS;
}

// Wire detection at import time — `beforeinstallprompt` can fire before the app
// component mounts, so we must be listening as early as possible.
if (typeof window !== "undefined" && !isStandalone()) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    canInstall.set(true);
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    canInstall.set(false);
    iosInstall.set(false);
  });
  if (isIOS()) iosInstall.set(true);
}

/** Fire the native install prompt (Android/Chrome/desktop). */
export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  try {
    await deferred.userChoice;
  } catch {
    /* user dismissed / unavailable */
  }
  deferred = null;
  canInstall.set(false);
}

/** Hide the banner and remember the choice. */
export function dismissInstall(): void {
  installDismissed.set(true);
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}
