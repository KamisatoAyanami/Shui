"use client";

import type { EventCallback, Options } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

/**
 * Check if the app is running inside a Tauri WebView.
 * Returns false in regular browsers, during SSR, or before Tauri initializes.
 */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}

/**
 * Safely listen to a Tauri event. Returns a no-op unlisten function
 * when not running inside Tauri, preventing crashes in regular browsers.
 */
export async function safeListen<T>(
  event: string,
  handler: EventCallback<T>,
  options?: Options
): Promise<UnlistenFn> {
  if (!isTauri()) {
    console.debug(`[Tauri] Skipping listen("${event}") — not in Tauri environment`);
    return () => {
      // no-op unlisten
    };
  }

  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<T>(event, handler, options);
  } catch (err) {
    console.error(`[Tauri] Failed to listen to event "${event}":`, err);
    return () => {
      // no-op unlisten
    };
  }
}

/**
 * Safely invoke a Tauri command. Returns undefined when not running
 * inside Tauri, preventing crashes in regular browsers.
 */
export async function safeInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T | undefined> {
  if (!isTauri()) {
    console.debug(`[Tauri] Skipping invoke("${cmd}") — not in Tauri environment`);
    return undefined;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[Tauri] Failed to invoke "${cmd}":`, err);
    throw err;
  }
}
