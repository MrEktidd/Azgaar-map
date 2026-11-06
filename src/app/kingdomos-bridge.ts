/**
 * Embedded world editor message bridge for KingdomOS. Standalone Azgaar unaffected.
 */
import { mapHistory } from "@/model/map-history";
import { VERSION } from "@/services/versioning";

const PROTOCOL = "kingdomos-azgaar";
const PROTOCOL_VERSION = 1;
type Command = "summary" | "snapshot" | "capture" | "import-map" | "new-map";
const embedded = window.parent !== window && new URLSearchParams(location.search).get("kingdomos") === "1";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function summary() {
  const last = mapHistory.at(-1);
  return {
    generatorVersion: VERSION,
    mapId: last?.created ?? null,
    seed: options.map.seed,
    width: options.map.graph.width,
    height: options.map.graph.height,
    cells: pack.cells?.i?.length ?? 0,
    states: Math.max(0, (pack.states?.length ?? 1) - 1),
    settlements: Math.max(0, (pack.burgs?.length ?? 1) - 1)
  };
}

function send(kind: "event" | "result", name: string, data: unknown, id?: string): void {
  window.parent.postMessage({ protocol: PROTOCOL, version: PROTOCOL_VERSION, kind, name, data, id }, location.origin);
}

async function run(name: Command, payload: unknown): Promise<unknown> {
  if (name === "summary") return summary();
  if (name === "snapshot") {
    if (options.app.mode) throw new Error("Finish the active map edit before capturing a world.");
    if (options.map.viewOnly) throw new Error("View-only worlds cannot be captured as editable projects.");
    const { Save } = await import("@/services/io/save");
    return { summary: summary(), mapText: Save.prepareMapData() };
  }

  if (name === "capture") {
    if (options.app.mode) throw new Error("Finish the current editing tool before sending the world to the Atlas.");
    if (options.map.viewOnly) throw new Error("Cannot capture a view-only project as an editable world.");
    // Keep native Azgaar project data and a genuine full-map visual preview together.
    const { Save } = await import("@/services/io/save");
    const mapText = Save.prepareMapData();
    const capturedSummary = summary();
    const { ExportMap } = await import("@/services/io/export");
    const imageUrl = await ExportMap.getMapURL("svg", { fullMap: true });
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("The Atlas preview could not be generated.");
    const preview = await response.blob();
    if (preview.size === 0 || preview.size > 80 * 1024 * 1024) {
      throw new Error("The exported map preview is empty or exceeds 80 MB.");
    }
    return { summary: capturedSummary, mapText, preview };
  }
  if (name === "import-map") {
    if (!isObject(payload) || !(payload.file instanceof Blob) ||
        typeof payload.name !== "string" || !/\.(map|gz)$/i.test(payload.name)) {
      throw new Error("Provide an Azgaar .map or .gz file.");
    }
    if (payload.file.size === 0 || payload.file.size > 100 * 1024 * 1024) {
      throw new Error("Map must be between 1 byte and 100 MB.");
    }
    if (options.app.mode) throw new Error("Finish the active map edit before importing.");
    const { Load } = await import("@/services/io/load");
    Load.uploadMap(payload.file);
    return { accepted: true, pending: true };
  }
  if (name === "new-map") {
    const { regeneratePrompt } = await import("@/app/lifecycle");
    regeneratePrompt();
    return { accepted: true, pending: true };
  }
  throw new Error("Unknown command");
}

function receive(event: MessageEvent): void {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  const message: unknown = event.data;
  if (!isObject(message) || message.protocol !== PROTOCOL ||
      message.version !== PROTOCOL_VERSION || message.kind !== "command") return;
  if (typeof message.id !== "string" || message.id.length > 100) return;
  if (!["summary","snapshot","capture","import-map","new-map"].includes(String(message.name))) return;
  const id = message.id;
  void run(message.name as Command, message.payload)
    .then(value => send("result", "ok", value, id))
    .catch(error => send("result", "error", { message: error instanceof Error ? error.message : "Editor command failed" }, id));
}

if (embedded) {
  window.addEventListener("message", receive);
  // Unlike "ready", booted means the initial map/load pipeline has completed,
  // so a persisted KingdomOS workspace can safely replace Azgaar's startup map.
  window.addEventListener("kingdomos:booted", () => send("event", "booted", summary()));
  window.addEventListener("map:generated", () => {
    try { send("event", "world-changed", summary()); } catch { /* map still starting */ }
  });
  send("event", "ready", { generatorVersion: VERSION, protocolVersion: PROTOCOL_VERSION });
}
