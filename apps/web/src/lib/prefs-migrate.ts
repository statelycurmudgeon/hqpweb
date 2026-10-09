// Stored preferences from older builds, read into today's shape (pure; prefs.svelte.ts uses it).

/**
 * The layout. Until 0.1.0-beta.6 the stored value was "current" (the default, saved along
 * with any other setting, so it says nothing about a choice) or "v2" (switched on). The new
 * layout is now the default and the old one is "classic", chosen only in Settings.
 */
export function layoutOf(stored: unknown): "v2" | "classic" {
  return stored === "classic" ? "classic" : "v2";
}
