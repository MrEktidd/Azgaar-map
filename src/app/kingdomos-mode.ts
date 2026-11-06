/**
 * The KingdomOS Atlas is a browsing/presentation instance of the same Azgaar
 * renderer as the editor. This mode is intentionally NOT saved to .map files.
 * The URL mode is also checked at mutation entry points: hiding tabs alone
 * would leave keyboard shortcuts and embedded menus able to edit the world.
 */
import "./kingdomos-atlas.css";

export const kingdomOSMode: "atlas" | "editor" | null =
  window.parent !== window && new URLSearchParams(window.location.search).get("kingdomos") === "atlas"
    ? "atlas"
    : window.parent !== window && new URLSearchParams(window.location.search).get("kingdomos") === "1"
      ? "editor"
      : null;

export function isKingdomOSAtlas(): boolean {
  return kingdomOSMode === "atlas";
}
if (kingdomOSMode) document.documentElement.dataset.kingdomosMode = kingdomOSMode;

/** Independent from map.viewOnly: the imported .map is never trusted to define UI permissions. */
export function applyAtlasReadOnly(): void {
  if (isKingdomOSAtlas()) options.map.viewOnly = true;
}

/** Prevent accidental mutation through shortcut paths while retaining navigation and layer shortcuts. */
export function isAtlasBrowsingShortcut(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (["Tab", "Escape", "F1", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) return true;
  if (/^[0-9=+\-]$/.test(event.key) && !event.shiftKey) return true;
  // Other unmodified letter hotkeys can toggle presentation layers; Shift opens editors.
  if (!event.shiftKey && event.code.startsWith("Key")) return true;
  return false;
}
