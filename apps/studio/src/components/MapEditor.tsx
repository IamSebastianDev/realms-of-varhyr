import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { factionInfo } from "@realms/content";
import {
  allowedShare,
  emptyMap,
  generatedPlaces,
  placeCount,
  hasPlacement,
  neutralAffiliation,
  placementAllows,
  nextId,
  parseMap,
  permanentSites,
  reachOf,
  serializeMap,
  territory,
  validateMap,
  type MapNode,
  type MapSettings,
  type NodeKind,
  type PermanentSite,
  type QuestMap,
  type ReachKind,
  type Zone,
  type ZoneMode,
} from "@realms/quest";
import * as fs from "../lib/fs";
import { SiteIcon, siteShape } from "./siteIcons";

/** The map is laid out in a world this many CSS pixels wide; zooming scales that world. */
const WORLD_W = 2400;
const MAX_ZOOM = 8;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const siteInfo: Record<PermanentSite, { name: string; glyph: string; note: string }> = {
  city: { name: "City", glyph: "C", note: "Heal for silver, market, rumors, smith" },
  village: { name: "Village", glyph: "V", note: "Rumors, smith" },
  shrine: { name: "Shrine", glyph: "S", note: "Exchange cards" },
  ruin: { name: "Ruin", glyph: "R", note: "Search for a card or silver" },
  waymark: { name: "Waymark", glyph: "W", note: "Reveals the land around it" },
  arena: { name: "Arena", glyph: "A", note: "Optional harder fight for silver" },
  capital: { name: "Capital", glyph: "★", note: "A faction's capital: market, smith" },
  landmark: { name: "Landmark", glyph: "L", note: "Lore, or a boss when flagged" },
};
const factionIds = Object.keys(factionInfo).filter((id) => id !== neutralAffiliation);
const affiliations = [...factionIds, neutralAffiliation];
const names: Record<string, string> = Object.fromEntries(
  Object.entries(factionInfo).map(([id, info]) => [id, info.name.replace(/^The /, "")]),
);
const affiliationName = (id: string) =>
  id === neutralAffiliation ? "Neutral (wilderness)" : (names[id] ?? id);
const colorOf = (id: string) => factionInfo[id]?.color ?? "#c6c3b5";

type Defaults = {
  site: PermanentSite;
  /** A faction id, or 'nearest' to copy the closest existing node. */ affiliation: string;
};
type Tool = "select" | "add" | "area";
type Polygon = [number, number][];
/** What undo restores: the nodes and the placement areas together. */
type Snap = { nodes: MapNode[]; zones: Zone[] };
type Gesture =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: "node"; id: string; sx: number; sy: number; moved: boolean; before: Snap }
  | {
      kind: "vertex";
      area: number;
      index: number;
      sx: number;
      sy: number;
      moved: boolean;
      before: Snap;
    };

async function imageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob),
    size = { w: bitmap.width, h: bitmap.height };
  bitmap.close();
  return size;
}
const draftKey = (scope: string) => `varhyr-quest-map-draft|${scope}`;
const readDraft = (scope: string): string | null => {
  try {
    return localStorage.getItem(draftKey(scope));
  } catch {
    return null;
  }
};
const storeDraft = (scope: string, text: string | null) => {
  try {
    if (text === null) localStorage.removeItem(draftKey(scope));
    else localStorage.setItem(draftKey(scope), text);
  } catch {
    /* Drafts are a convenience. */
  }
};

/**
 * The node tool: places the quest map's nodes on the painted map, says what each one is and whose land it lies on, and shows the
 * territories and borders that follow from that. Saves assets/quest/map.json.
 */
export function MapEditor({
  repo,
  scope,
  active,
}: {
  repo: fs.Repo;
  scope: string;
  active: boolean;
}) {
  const [map, setMap] = useState<QuestMap | null>(null);
  const [saved, setSaved] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageMissing, setImageMissing] = useState(false);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setToolState] = useState<Tool>("select");
  const [draft, setDraft] = useState<Polygon>([]);
  const [area, setArea] = useState<number | null>(null);
  const [zoneMode, setZoneMode0] = useState<ZoneMode>("allow");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [defaults, setDefaults] = useState<Defaults>({ site: "city", affiliation: "nearest" });
  const [sample, setSample] = useState(1);
  const [overlay, setOverlay] = useState({
    territories: true,
    borders: true,
    labels: true,
    land: true,
    places: true,
  });
  const [view, setView] = useState({ zoom: 0.3, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const gesture = useRef<Gesture | null>(null);
  const lastEdit = useRef({ key: "", time: 0 });
  const fitted = useRef("");

  const setTool = (next: Tool | ((value: Tool) => Tool)) => {
    const value = typeof next === "function" ? next(tool) : next;
    setToolState(value);
    setDraft([]);
    if (value !== "select") {
      setSelected(null);
      setArea(null);
    }
  };
  const guard = async (work: () => Promise<void>) => {
    setProblem("");
    try {
      await work();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };
  const text = useMemo(() => (map ? serializeMap(map) : ""), [map]);
  const dirty = !!map && text !== saved;
  const worldH = map ? WORLD_W / map.aspect : 0;

  // Load the saved map (or an unsaved draft kept in the browser), and start a new one from the first image found.
  useEffect(() => {
    let cancelled = false;
    void guard(async () => {
      const [file, images] = await Promise.all([fs.readQuestMap(repo), fs.listQuestImages(repo)]);
      if (cancelled) return;
      let loaded = file ? parseMap(file) : null;
      setSaved(loaded ? serializeMap(loaded) : "");
      const draft = readDraft(scope);
      if (draft) {
        try {
          loaded = parseMap(draft);
          setStatus("Restored your unsaved changes.");
        } catch {
          storeDraft(scope, null);
        }
      }
      if (!loaded && images.length) {
        const blob = await fs.readQuestImage(repo, images[0]);
        if (blob) {
          const dimensions = await imageSize(blob);
          loaded = emptyMap(images[0], dimensions.w / dimensions.h);
        }
      }
      if (!cancelled) setMap(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, scope]);

  // The painted map.
  const imageName = map?.image ?? "";
  useEffect(() => {
    if (!imageName) {
      setImageUrl("");
      setImageMissing(false);
      return;
    }
    let cancelled = false,
      made = "";
    void fs.readQuestImage(repo, imageName).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setImageUrl("");
        setImageMissing(true);
        return;
      }
      made = URL.createObjectURL(blob);
      setImageUrl(made);
      setImageMissing(false);
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [repo, imageName]);

  useEffect(() => {
    if (map) storeDraft(scope, dirty ? text : null);
  }, [dirty, text, scope, map]);

  // Keep the viewport size, and fit the whole map into view the first time it can be measured.
  useEffect(() => {
    if (!frame) return;
    const watch = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setSize({ w: box.width, h: box.height });
    });
    watch.observe(frame);
    return () => watch.disconnect();
  }, [frame]);
  const fitZoom = map && size.w ? Math.min(size.w / WORLD_W, size.h / worldH) * 0.97 : 0.3;
  const fit = useCallback(() => {
    if (!map || !size.w) return;
    const zoom = Math.min(size.w / WORLD_W, size.h / (WORLD_W / map.aspect)) * 0.97;
    setView({
      zoom,
      x: (size.w - WORLD_W * zoom) / 2,
      y: (size.h - (WORLD_W / map.aspect) * zoom) / 2,
    });
  }, [map, size]);
  useEffect(() => {
    const id = map ? `${map.image}|${map.aspect}` : "";
    if (id && size.w > 0 && fitted.current !== id) {
      fitted.current = id;
      fit();
    }
  }, [map, size, fit]);

  const zoomBy = useCallback(
    (factor: number, around?: { x: number; y: number }) => {
      setView((current) => {
        const zoom = clamp(current.zoom * factor, fitZoom * 0.5, MAX_ZOOM),
          k = zoom / current.zoom;
        const px = around?.x ?? size.w / 2,
          py = around?.y ?? size.h / 2;
        return { zoom, x: px - (px - current.x) * k, y: py - (py - current.y) * k };
      });
    },
    [fitZoom, size],
  );
  useEffect(() => {
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = frame.getBoundingClientRect();
      zoomBy(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0016)), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      });
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [frame, zoomBy]);

  // Every change to the nodes or the placement areas goes through here, so it can be undone. Typing in a text field counts as one change.
  const snapOf = (value: QuestMap): Snap => ({
    nodes: value.nodes,
    zones: value.placement?.zones ?? [],
  });
  const restore = (value: QuestMap, snap: Snap): QuestMap => ({
    ...value,
    nodes: snap.nodes,
    placement: snap.zones.length ? { zones: snap.zones } : undefined,
  });
  const remember = (coalesce: string) => {
    if (!map) return;
    const now = Date.now();
    if (!(coalesce && lastEdit.current.key === coalesce && now - lastEdit.current.time < 1500)) {
      setPast((current) => [...current.slice(-99), snapOf(map)]);
      setFuture([]);
    }
    lastEdit.current = { key: coalesce, time: now };
    setStatus("");
  };
  const edit = (change: (nodes: MapNode[]) => MapNode[], coalesce = "") => {
    if (!map) return;
    remember(coalesce);
    setMap({ ...map, nodes: change(map.nodes) });
  };
  const editAreas = (change: (zones: Zone[]) => Zone[], coalesce = "") => {
    if (!map) return;
    remember(coalesce);
    setMap(restore(map, { nodes: map.nodes, zones: change(map.placement?.zones ?? []) }));
  };
  const undo = () => {
    if (!map || !past.length) return;
    setFuture((current) => [snapOf(map), ...current]);
    setMap(restore(map, past[past.length - 1]));
    setPast((current) => current.slice(0, -1));
    setArea(null);
    lastEdit.current.key = "";
  };
  const redo = () => {
    if (!map || !future.length) return;
    setPast((current) => [...current, snapOf(map)]);
    setMap(restore(map, future[0]));
    setFuture((current) => current.slice(1));
    setArea(null);
    lastEdit.current.key = "";
  };
  const update = (id: string, change: Partial<MapNode>, coalesce = "") =>
    edit(
      (nodes) => nodes.map((node) => (node.id === id ? { ...node, ...change } : node)),
      coalesce && `${coalesce}:${id}`,
    );
  const remove = (id: string) => {
    edit((nodes) => nodes.filter((node) => node.id !== id));
    setSelected(null);
  };
  const removeArea = (index: number) => {
    editAreas((zones) => zones.filter((_, at) => at !== index));
    setArea(null);
  };
  const setZoneMode = (index: number, mode: ZoneMode) =>
    editAreas((zones) => zones.map((zone, at) => (at === index ? { ...zone, mode } : zone)));
  const moveZone = (index: number, by: number) => {
    const to = index + by;
    if (!map?.placement || to < 0 || to >= map.placement.zones.length) return;
    editAreas((zones) => {
      const next = [...zones];
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next;
    });
    setArea(to);
  };
  const closeDraft = () => {
    if (draft.length >= 3) {
      editAreas((zones) => [...zones, { mode: zoneMode, polygon: draft }]);
      setArea(map?.placement?.zones.length ?? 0);
      setTool("select");
    }
  };
  const toMap = (clientX: number, clientY: number) => {
    const box = frame!.getBoundingClientRect();
    return {
      x: clamp((clientX - box.left - view.x) / view.zoom / WORLD_W, 0, 1),
      y: clamp((clientY - box.top - view.y) / view.zoom / worldH, 0, 1),
    };
  };
  const nearest = (x: number, y: number) => {
    let best: MapNode | undefined,
      distance = Infinity;
    for (const node of map!.nodes) {
      const d = Math.hypot(node.x - x, (node.y - y) / map!.aspect);
      if (d < distance) {
        distance = d;
        best = node;
      }
    }
    return best;
  };
  const addAt = (x: number, y: number) => {
    if (!map) return;
    const affiliation =
      defaults.affiliation === "nearest"
        ? (nearest(x, y)?.affiliation ?? neutralAffiliation)
        : defaults.affiliation;
    const node: MapNode = {
      id: nextId(map.nodes),
      x: Math.round(x * 1e5) / 1e5,
      y: Math.round(y * 1e5) / 1e5,
      kind: "permanent",
      affiliation,
      site: defaults.site,
    };
    edit((nodes) => [...nodes, node]);
  };

  const onBackgroundDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    frame!.setPointerCapture(event.pointerId);
    gesture.current = {
      kind: "pan",
      sx: event.clientX,
      sy: event.clientY,
      vx: view.x,
      vy: view.y,
      moved: false,
    };
  };
  const onNodeDown = (event: ReactPointerEvent, id: string) => {
    if (tool === "area") return;
    event.stopPropagation();
    if (event.button !== 0 || !map) return;
    frame!.setPointerCapture(event.pointerId);
    setToolState("select");
    setSelected(id);
    setArea(null);
    gesture.current = {
      kind: "node",
      id,
      sx: event.clientX,
      sy: event.clientY,
      moved: false,
      before: snapOf(map),
    };
  };
  const onVertexDown = (event: ReactPointerEvent, index: number, vertex: number) => {
    event.stopPropagation();
    if (event.button !== 0 || !map) return;
    frame!.setPointerCapture(event.pointerId);
    gesture.current = {
      kind: "vertex",
      area: index,
      index: vertex,
      sx: event.clientX,
      sy: event.clientY,
      moved: false,
      before: snapOf(map),
    };
  };
  const onAreaDown = (event: ReactPointerEvent, index: number) => {
    if (tool !== "select") return; // While drawing, clicks on other zones add corners instead.
    event.stopPropagation();
    if (event.button !== 0) return;
    setSelected(null);
    setArea(index);
  };
  const onMove = (event: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || !map) return;
    const far = Math.abs(event.clientX - g.sx) + Math.abs(event.clientY - g.sy) > 4;
    if (far) g.moved = true;
    if (!g.moved) return;
    if (g.kind === "pan")
      setView((current) => ({
        ...current,
        x: g.vx + event.clientX - g.sx,
        y: g.vy + event.clientY - g.sy,
      }));
    else if (g.kind === "vertex") {
      const at = toMap(event.clientX, event.clientY);
      setMap({
        ...map,
        placement: {
          zones: (map.placement?.zones ?? []).map((zone, index) =>
            index === g.area
              ? {
                  ...zone,
                  polygon: zone.polygon.map((point, at2) =>
                    at2 === g.index ? ([at.x, at.y] as [number, number]) : point,
                  ),
                }
              : zone,
          ),
        },
      });
    } else {
      const at = toMap(event.clientX, event.clientY);
      setMap({
        ...map,
        nodes: map.nodes.map((node) => (node.id === g.id ? { ...node, x: at.x, y: at.y } : node)),
      });
    }
  };
  const onUp = (event: ReactPointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !map) return;
    if ((g.kind === "node" || g.kind === "vertex") && g.moved) {
      setPast((current) => [...current.slice(-99), g.before]);
      setFuture([]);
      lastEdit.current.key = "";
    }
    if (g.kind === "pan" && !g.moved && event.type === "pointerup") {
      const at = toMap(event.clientX, event.clientY);
      if (tool === "add") addAt(at.x, at.y);
      else if (tool === "area") {
        const first = draft[0];
        if (
          first &&
          draft.length >= 3 &&
          Math.hypot(first[0] - at.x, (first[1] - at.y) / map.aspect) < 12 * unitOf()
        )
          closeDraft();
        else
          setDraft((points) => [
            ...points,
            [Math.round(at.x * 1e5) / 1e5, Math.round(at.y * 1e5) / 1e5],
          ]);
      } else {
        setSelected(null);
        setArea(null);
      }
    }
  };

  const save = () =>
    guard(async () => {
      if (!map) return;
      await fs.writeQuestMap(repo, text);
      setSaved(text);
      storeDraft(scope, null);
      setStatus("Saved assets/quest/map.json.");
    });
  const chooseImage = (file: File | undefined) =>
    file &&
    guard(async () => {
      const dimensions = await imageSize(file);
      await fs.writeQuestImage(repo, file.name, file);
      setMap((current) =>
        current
          ? { ...current, image: file.name, aspect: dimensions.w / dimensions.h }
          : emptyMap(file.name, dimensions.w / dimensions.h),
      );
      setStatus(
        `Copied ${file.name} into assets/quest. Nodes keep their place relative to the picture.`,
      );
    });
  const setReachBy = (kind: ReachKind, value: number) =>
    map &&
    setMap({
      ...map,
      settings: { ...map.settings, reachBy: { ...map.settings.reachBy, [kind]: value } },
    });
  const setPlacing = (key: "density" | "spacing", value: number) =>
    map && setMap({ ...map, settings: { ...map.settings, [key]: value } });
  const generateExample = () => {
    setOverlay((value) => ({ ...value, places: true }));
    setSample((value) => value + 1);
  };
  const unitOf = () => 1 / (WORLD_W * view.zoom);
  const setting = (key: "reveal" | "borderReach", value: number) =>
    map && setMap({ ...map, settings: { ...map.settings, [key]: value } });

  // Keyboard shortcuts, only while this tab is showing and no field has focus.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    if ((event.target as HTMLElement).closest("input,select,textarea") || !map) return;
    const mod = event.metaKey || event.ctrlKey,
      key = event.key.toLowerCase();
    if (mod && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (mod && key === "y") {
      event.preventDefault();
      redo();
    } else if (mod && key === "s") {
      event.preventDefault();
      void save();
    } else if (mod) return;
    else if (key === "a") setTool((current) => (current === "add" ? "select" : "add"));
    else if (key === "b" && tool === "area")
      setZoneMode0((value) => (value === "allow" ? "block" : "allow"));
    else if (key === "p") setTool((current) => (current === "area" ? "select" : "area"));
    else if (key === "enter" && tool === "area") closeDraft();
    else if (key === "v" || key === "escape") {
      if (tool === "area" && draft.length) setDraft([]);
      else if (tool !== "select") setTool("select");
      else {
        setSelected(null);
        setArea(null);
      }
    } else if ((key === "delete" || key === "backspace") && area !== null) {
      event.preventDefault();
      removeArea(area);
    } else if ((key === "delete" || key === "backspace") && selected) {
      event.preventDefault();
      remove(selected);
    } else if (key === "+" || key === "=") zoomBy(1.25);
    else if (key === "-") zoomBy(0.8);
    else if (key === "0") fit();
    else if (selected && key.startsWith("arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? 0.005 : 0.001,
        dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0,
        dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
      update(
        selected,
        {
          x: clamp((map.nodes.find((node) => node.id === selected)?.x ?? 0) + dx, 0, 1),
          y: clamp(
            (map.nodes.find((node) => node.id === selected)?.y ?? 0) + dy * map.aspect,
            0,
            1,
          ),
        },
        "nudge",
      );
    }
  };
  useEffect(() => {
    if (!active) return;
    const listener = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [active]);

  const geometry = useMemo(
    () =>
      map && (overlay.territories || overlay.borders) ? territory(map) : { cells: [], borders: [] },
    [map, overlay.territories, overlay.borders],
  );
  const issues = useMemo(() => {
    if (!map) return { errors: [], warnings: [] };
    const found = validateMap(map, factionIds, names);
    const settlements = map.nodes.filter(
      (node) => node.site === "city" || node.site === "village" || node.site === "capital",
    );
    const warnings = [...found.warnings];
    if (!map.nodes.some((node) => node.site === "city"))
      warnings.push("No city: expeditions cannot heal or restock anywhere permanent.");
    if (!map.nodes.some((node) => node.site === "city" || node.site === "village"))
      warnings.push("No city or village: nobody can give out rumors, so there are no tasks.");
    if (!map.nodes.some((node) => node.site === "village"))
      warnings.push("No village: smiths and rumors are only in cities.");
    if (!hasPlacement(map))
      warnings.push(
        "No allowed zones: no travel locations (encounters, camps, merchants, caches) will appear, and task destinations only near existing nodes. Press P and draw the safe land.",
      );
    else
      for (const node of settlements)
        if (!placementAllows(map, node.x, node.y)) {
          warnings.push(
            "Some towns lie outside the allowed zones; tasks from them may have no valid destination nearby.",
          );
          break;
        }
    return { errors: found.errors, warnings };
  }, [map]);
  const current = map?.nodes.find((node) => node.id === selected);
  const share = useMemo(() => (map ? allowedShare(map) : 0), [map?.placement]); // eslint-disable-line react-hooks/exhaustive-deps
  // The sample is the costly part, so it follows the map a beat behind (React drops stale runs while dragging) and ignores everything but what shapes it.
  const sampleMap = useDeferredValue(map);
  const places = useMemo(
    () => (sampleMap && overlay.places ? generatedPlaces(sampleMap, sample) : []),
    [
      sampleMap?.placement,
      sampleMap?.nodes,
      sampleMap?.settings.density,
      sampleMap?.settings.spacing,
      sampleMap?.aspect,
      overlay.places,
      sample,
    ],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(
    () =>
      affiliations.map((id) => {
        const own = map?.nodes.filter((node) => node.affiliation === id) ?? [];
        return {
          id,
          nodes: own.length,
          capital: own.some((node) => node.site === "capital"),
          starts: own.filter((node) => node.start).length,
          bosses: own.filter((node) => node.target).length,
        };
      }),
    [map],
  );

  if (!map)
    return (
      <div className="map-editor map-empty" hidden={!active}>
        <div>
          <h2>The quest map</h2>
          <p>
            Choose the painted map to place nodes on. It is copied into <code>assets/quest</code>,
            and the node positions are saved next to it as <code>map.json</code>.
          </p>
          <label className="map-file">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => chooseImage(event.target.files?.[0])}
            />
            <span className="primary">Choose map image</span>
          </label>
          {status && (
            <p role="status" className="studio-status">
              {status}
            </p>
          )}
          {problem && (
            <p role="alert" className="studio-problem">
              {problem}
            </p>
          )}
        </div>
      </div>
    );

  const unit = 1 / (WORLD_W * view.zoom); // One screen pixel, in the map's own units.
  const iso = (node: MapNode) => ({ x: node.x, y: node.y / map.aspect });
  const points = (polygon: [number, number][]) =>
    polygon.map(([x, y]) => `${x},${y / map.aspect}`).join(" ");
  const set = (patch: Partial<Defaults>) => setDefaults((value) => ({ ...value, ...patch }));

  const rail = (
    label: string,
    glyph: string,
    run: () => void,
    options: { on?: boolean; off?: boolean; hint?: string } = {},
  ) => (
    <button
      className={`rail-btn${options.on ? " on" : ""}`}
      onClick={run}
      disabled={options.off}
      aria-label={label}
      aria-pressed={options.on}
      title={options.hint ?? label}
    >
      <span aria-hidden>{glyph}</span>
      <small>{label}</small>
    </button>
  );

  return (
    <div className="map-editor" hidden={!active}>
      <div
        ref={setFrame}
        className={`map-frame ${tool !== "select" ? "adding" : ""}`}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className="map-world"
          style={{
            width: WORLD_W,
            height: worldH,
            transform: `translate(${view.x}px,${view.y}px) scale(${view.zoom})`,
          }}
        >
          {imageUrl && (
            <img src={imageUrl} alt="" draggable={false} width={WORLD_W} height={worldH} />
          )}
          <svg viewBox={`0 0 1 ${1 / map.aspect}`} width={WORLD_W} height={worldH}>
            {overlay.land &&
              (map.placement?.zones ?? []).map((zone, index) => (
                <g key={index} className={`area ${zone.mode}${area === index ? " on" : ""}`}>
                  <polygon points={points(zone.polygon)} className="area-fill" />
                  <polygon
                    points={points(zone.polygon)}
                    className="area-hit"
                    onPointerDown={(event) => onAreaDown(event, index)}
                  />
                  {area === index &&
                    zone.polygon.map(([x, y], vertex) => (
                      <circle
                        key={vertex}
                        cx={x}
                        cy={y / map.aspect}
                        r={6 * unit}
                        className="vertex"
                        onPointerDown={(event) => onVertexDown(event, index, vertex)}
                      />
                    ))}
                </g>
              ))}
            {tool === "area" && draft.length > 0 && (
              <g className={`area draft ${zoneMode}`}>
                <polyline points={points(draft)} className="area-line" />
                {draft.map(([x, y], vertex) => (
                  <circle
                    key={vertex}
                    cx={x}
                    cy={y / map.aspect}
                    r={(vertex === 0 && draft.length >= 3 ? 8 : 4.5) * unit}
                    className={`vertex${vertex === 0 ? " first" : ""}`}
                  />
                ))}
              </g>
            )}
            {overlay.territories &&
              geometry.cells.map((cell) => (
                <polygon
                  key={cell.id}
                  points={points(cell.polygon)}
                  fill={colorOf(cell.affiliation)}
                  fillOpacity={cell.affiliation === neutralAffiliation ? 0.07 : 0.2}
                />
              ))}
            {overlay.borders && (
              <>
                <path
                  d={geometry.borders
                    .map(
                      (border) =>
                        `M${border.a[0]} ${border.a[1] / map.aspect}L${border.b[0]} ${border.b[1] / map.aspect}`,
                    )
                    .join("")}
                  className="border-shade"
                />
                <path
                  d={geometry.borders
                    .map(
                      (border) =>
                        `M${border.a[0]} ${border.a[1] / map.aspect}L${border.b[0]} ${border.b[1] / map.aspect}`,
                    )
                    .join("")}
                  className="border-line"
                />
              </>
            )}
            {current && (
              <g className="radii">
                <circle
                  cx={iso(current).x}
                  cy={iso(current).y}
                  r={map.settings.reveal}
                  className="reveal"
                />
                <circle
                  cx={iso(current).x}
                  cy={iso(current).y}
                  r={reachOf(current, map.settings)}
                  className="reach"
                />
              </g>
            )}
            {places.map((place) => (
              <g
                key={place.id}
                transform={`translate(${place.x} ${place.y / map.aspect}) scale(${unit})`}
                className="node sample"
              >
                <title>Sample travel location · {affiliationName(place.affiliation)}</title>
                <circle r={11} className="body transient" stroke={colorOf(place.affiliation)} />
                <text className="glyph transient" dy="0.36em" fill={colorOf(place.affiliation)}>
                  ?
                </text>
              </g>
            ))}
            {map.nodes.map((node) => {
              const { x, y } = iso(node),
                color = colorOf(node.affiliation),
                site = node.site ? siteInfo[node.site] : undefined;
              const radius = node.site === "capital" ? 19 : node.site === "city" ? 16 : 14;
              return (
                <g
                  key={node.id}
                  transform={`translate(${x} ${y}) scale(${unit})`}
                  className={`node ${node.id === selected ? "on" : ""}`}
                  onPointerDown={(event) => onNodeDown(event, node.id)}
                >
                  <title>
                    {node.name || (site ? site.name : "Unknown place")} ·{" "}
                    {affiliationName(node.affiliation)}
                  </title>
                  <circle r={22} className="hit" />
                  {node.id === selected && <circle r={radius + 6} className="ring" />}
                  {node.site === "capital" && <circle r={radius + 5} className="crown" />}
                  <circle r={radius} fill={color} className="body" />
                  <g
                    className="site-ico"
                    fill="currentColor"
                    transform={`scale(${(radius / 12) * 0.78})`}
                  >
                    {siteShape(node.site!)}
                  </g>
                  {node.start && <circle cx={radius} cy={-radius} r={4.5} className="flag start" />}
                  {node.target && (
                    <circle
                      cx={radius}
                      cy={-radius + (node.start ? 10 : 0)}
                      r={4.5}
                      className="flag target"
                    />
                  )}
                  {overlay.labels && node.name && (
                    <text className="label" y={radius + 13}>
                      {node.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        {!imageUrl && (
          <p className="map-banner">
            {imageMissing
              ? `The image ${map.image} is not in assets/quest. Choose it again in the inspector.`
              : "Loading the map…"}
          </p>
        )}
      </div>

      <nav className="map-float map-rail" aria-label="Map tools">
        {rail("Select", "↖", () => setTool("select"), {
          on: tool === "select",
          hint: "Select and move (V)",
        })}
        {rail("Add", "+", () => setTool("add"), { on: tool === "add", hint: "Add nodes (A)" })}
        {rail("Area", "⬠", () => setTool("area"), {
          on: tool === "area",
          hint: "Draw allowed and blocked zones (P)",
        })}
        <hr />
        {rail("Undo", "↶", undo, { off: !past.length, hint: "Undo (Ctrl/Cmd+Z)" })}
        {rail("Redo", "↷", redo, { off: !future.length, hint: "Redo (Ctrl/Cmd+Shift+Z)" })}
        <hr />
        {rail("Zoom in", "⊕", () => zoomBy(1.25), { hint: "Zoom in (+)" })}
        {rail("Zoom out", "⊖", () => zoomBy(0.8), { hint: "Zoom out (−)" })}
        {rail("Fit", "⛶", fit, { hint: "Fit the whole map (0)" })}
        <hr />
        {rail("Areas", "▦", () => setOverlay({ ...overlay, territories: !overlay.territories }), {
          on: overlay.territories,
          hint: "Territory colours",
        })}
        {rail("Places", "?", () => setOverlay({ ...overlay, places: !overlay.places }), {
          on: overlay.places,
          hint: "Sample travel locations made inside the placement areas",
        })}
        {rail("Land", "◩", () => setOverlay({ ...overlay, land: !overlay.land }), {
          on: overlay.land,
          hint: "Allowed and blocked zones",
        })}
        {rail("Borders", "┅", () => setOverlay({ ...overlay, borders: !overlay.borders }), {
          on: overlay.borders,
          hint: "Borders",
        })}
        {rail("Names", "Aa", () => setOverlay({ ...overlay, labels: !overlay.labels }), {
          on: overlay.labels,
          hint: "Node names",
        })}
        <hr />
        <button
          className={`rail-btn save${dirty ? " dirty" : ""}`}
          onClick={save}
          disabled={!dirty}
          title="Save map (Ctrl/Cmd+S)"
        >
          <span aria-hidden>⤓</span>
          <small>{dirty ? "Save" : "Saved"}</small>
        </button>
      </nav>

      <p className="map-float map-hint" aria-hidden>
        {tool === "add"
          ? "Click the map to place a node. Esc to stop."
          : tool === "area"
            ? draft.length >= 3
              ? "Click the first point or press Enter to close the area. Esc to cancel."
              : `Click to outline ${zoneMode === "allow" ? "allowed land" : "ground to keep clear"}. B switches Allow/Block. Esc to cancel.`
            : "Drag the map to pan, scroll to zoom. A adds nodes, P draws zones."}
      </p>
      {(status || problem) && (
        <p
          role={problem ? "alert" : "status"}
          className={`map-float map-toast${problem ? " bad" : ""}`}
        >
          {problem || status}
        </p>
      )}

      {!inspectorOpen && (
        <button className="map-float map-reopen" onClick={() => setInspectorOpen(true)}>
          Inspector
        </button>
      )}
      {inspectorOpen && (
        <aside className="map-float map-panel" aria-label="Inspector">
          <header>
            <h2>
              {current
                ? current.name || (current.site ? siteInfo[current.site].name : "Place")
                : area !== null
                  ? "Zone"
                  : tool === "area"
                    ? "New zone"
                    : tool === "add"
                      ? "New nodes"
                      : "Quest map"}
            </h2>
            <span className="count">{map.nodes.length} nodes</span>
            <button
              onClick={() => setInspectorOpen(false)}
              aria-label="Hide inspector"
              title="Hide inspector"
            >
              ×
            </button>
          </header>
          <div className="map-scroll">
            {current && (
              <section className="map-section" aria-label="Selected node">
                <label className="field">
                  <span>Name</span>
                  <input
                    value={current.name ?? ""}
                    placeholder="e.g. Morning Vale"
                    onChange={(event) =>
                      update(current.id, { name: event.target.value || undefined }, "name")
                    }
                  />
                </label>
                <label className="field">
                  <span>Site</span>
                  <select
                    value={current.site}
                    onChange={(event) =>
                      update(current.id, { site: event.target.value as PermanentSite })
                    }
                  >
                    {permanentSites.map((site) => (
                      <option key={site} value={site}>
                        {siteInfo[site].name}: {siteInfo[site].note}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Affiliation</span>
                  <select
                    value={current.affiliation}
                    onChange={(event) => update(current.id, { affiliation: event.target.value })}
                  >
                    {affiliations.map((id) => (
                      <option key={id} value={id}>
                        {affiliationName(id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!current.start}
                    onChange={(event) =>
                      update(current.id, { start: event.target.checked || undefined })
                    }
                  />
                  An expedition of this faction can start here
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!current.target}
                    onChange={(event) =>
                      update(current.id, { target: event.target.checked || undefined })
                    }
                  />
                  A boss may wait here (drawn from the seed)
                </label>
                <label className="field">
                  <span>
                    Projection <b>×{(current.reach ?? 1).toFixed(1)}</b>
                    <small>
                      {(reachOf(current, map.settings) * 100).toFixed(1)}% of the map width
                    </small>
                  </span>
                  <input
                    type="range"
                    min={0.2}
                    max={4}
                    step={0.1}
                    value={current.reach ?? 1}
                    onChange={(event) =>
                      update(
                        current.id,
                        {
                          reach:
                            Number(event.target.value) === 1
                              ? undefined
                              : Number(event.target.value),
                        },
                        "reach",
                      )
                    }
                  />
                  <small>
                    How far this place claims land. It decides whose ground a travel location or
                    task stands on. Dotted ring on the map.
                  </small>
                </label>
                <button className="danger" onClick={() => remove(current.id)}>
                  Delete node <small>Del</small>
                </button>
              </section>
            )}

            {!current && area !== null && map.placement?.zones[area] && (
              <section className="map-section" aria-label="Zone">
                <div className="views" role="group" aria-label="Zone mode">
                  <button
                    className={map.placement.zones[area]!.mode === "allow" ? "on" : ""}
                    onClick={() => setZoneMode(area, "allow")}
                  >
                    Allow
                  </button>
                  <button
                    className={map.placement.zones[area]!.mode === "block" ? "on" : ""}
                    onClick={() => setZoneMode(area, "block")}
                  >
                    Block
                  </button>
                </div>
                <p className="studio-hint">
                  Where zones overlap, the smaller one wins, so an island inside a lake stays land
                  whatever you drew first. Drag a corner to reshape it.
                </p>
                <div className="views">
                  <button
                    disabled={area >= map.placement.zones.length - 1}
                    onClick={() => moveZone(area, 1)}
                    title="Draw this zone later, so it wins over more of the others"
                  >
                    Bring forward
                  </button>
                  <button disabled={area === 0} onClick={() => moveZone(area, -1)}>
                    Send back
                  </button>
                </div>
                <button className="danger" onClick={() => removeArea(area)}>
                  Delete zone <small>Del</small>
                </button>
              </section>
            )}

            {!current && area === null && tool === "area" && (
              <section className="map-section" aria-label="New zone">
                <div className="views" role="group" aria-label="Zone mode">
                  <button
                    className={zoneMode === "allow" ? "on" : ""}
                    onClick={() => setZoneMode0("allow")}
                  >
                    Allow
                  </button>
                  <button
                    className={zoneMode === "block" ? "on" : ""}
                    onClick={() => setZoneMode0("block")}
                  >
                    Block
                  </button>
                </div>
                <p className="studio-hint">
                  {zoneMode === "allow"
                    ? "Outline land where new places may stand."
                    : "Outline ground to keep clear, such as an inland lake."}{" "}
                  Close the shape with Enter or by clicking the first point. Zones are layered: the
                  smallest zone around a spot decides, so a lake inside land blocks it and an island
                  inside the lake allows it again, in any drawing order. Travel locations
                  (encounters, camps, merchants, caches) are made at random on allowed ground for
                  each expedition; the ? marks are a sample.
                </p>
                <div className="views">
                  <button
                    onClick={generateExample}
                    title="Show another example of the travel locations an expedition would get"
                  >
                    Generate example
                  </button>
                </div>
                {draft.length > 0 && (
                  <div className="views">
                    <button disabled={draft.length < 3} onClick={closeDraft}>
                      Close zone
                    </button>
                    <button onClick={() => setDraft([])}>Cancel</button>
                  </div>
                )}
              </section>
            )}

            {!current && area === null && tool !== "area" && (
              <section className="map-section" aria-label="New nodes">
                <p className="studio-hint">
                  {tool === "add"
                    ? "Every click places a node with these settings."
                    : "Select a node to edit it, or press A to add nodes."}
                </p>
                <div className="site-grid" role="group" aria-label="Site">
                  {permanentSites.map((site) => (
                    <button
                      key={site}
                      className={defaults.site === site ? "on" : ""}
                      title={siteInfo[site].note}
                      onClick={() => {
                        set({ site });
                        setTool("add");
                      }}
                    >
                      <SiteIcon site={site} />
                      {siteInfo[site].name}
                    </button>
                  ))}
                </div>
                <label className="field">
                  <span>Affiliation</span>
                  <select
                    value={defaults.affiliation}
                    onChange={(event) => set({ affiliation: event.target.value })}
                  >
                    <option value="nearest">Same as the nearest node</option>
                    {affiliations.map((id) => (
                      <option key={id} value={id}>
                        {affiliationName(id)}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            )}

            <details className="map-section" open={issues.errors.length > 0}>
              <summary>
                Overview{" "}
                <small>
                  {map.nodes.length} nodes, {map.placement?.zones.length ?? 0} zones
                  {issues.errors.length
                    ? `, ${issues.errors.length} errors`
                    : issues.warnings.length
                      ? `, ${issues.warnings.length} to do`
                      : ""}
                </small>
              </summary>
              <table className="map-table">
                <thead>
                  <tr>
                    <th>Affiliation</th>
                    <th>Nodes</th>
                    <th>Capital</th>
                    <th>Starts</th>
                    <th>Bosses</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <i className="dot" style={{ background: colorOf(row.id) }} />
                        {affiliationName(row.id).replace(" (wilderness)", "")}
                      </td>
                      <td>{row.nodes}</td>
                      <td>{row.id === neutralAffiliation ? "" : row.capital ? "✓" : "–"}</td>
                      <td>{row.starts}</td>
                      <td>{row.bosses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="studio-issues">
                {issues.errors.map((message) => (
                  <li key={message} className="error">
                    {message}
                  </li>
                ))}
                {issues.warnings.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </details>

            <details className="map-section" open={hasPlacement(map)}>
              <summary>
                Travel locations{" "}
                <small>
                  {hasPlacement(map)
                    ? `${placeCount(map)} per expedition`
                    : "needs an allowed zone"}
                </small>
              </summary>
              <label className="field">
                <span>
                  Density <b>{Math.round(map.settings.density / 2)}%</b>
                  <small>50% is a dense, busy map</small>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={map.settings.density / 2}
                  onChange={(event) => setPlacing("density", Number(event.target.value) * 2)}
                />
              </label>
              <label className="field">
                <span>
                  Spacing <b>{(map.settings.spacing * 100).toFixed(1)}%</b>
                  <small>of the map width</small>
                </span>
                <input
                  type="range"
                  min={0.004}
                  max={0.1}
                  step={0.002}
                  value={map.settings.spacing}
                  onChange={(event) => setPlacing("spacing", Number(event.target.value))}
                />
              </label>
              <p className="studio-hint">
                {hasPlacement(map)
                  ? `Allowed zones cover ${(share * 100).toFixed(0)}% of the map, so an expedition gets ${placeCount(map)} places (encounters, camps, merchants, caches). The example shows ${places.length}.`
                  : "Draw at least one Allow zone (P) and travel locations will fill it."}
              </p>
              <button className="primary" onClick={generateExample} disabled={!hasPlacement(map)}>
                Generate example
              </button>
            </details>

            <details className="map-section">
              <summary>
                Distances <small>% of the map width</small>
              </summary>
              {(
                [
                  [
                    "reveal",
                    "Reveal radius",
                    "What a visited node uncovers. Shown solid around the selected node; the dotted pale ring is its border reach.",
                  ],
                  [
                    "borderReach",
                    "Border reach",
                    "The base distance borders extend from a node. Each kind of place below multiplies it.",
                  ],
                ] as const
              ).map(([key, label, hint]) => (
                <label className="field" key={key}>
                  <span>
                    {label} <b>{(map.settings[key] * 100).toFixed(1)}%</b>
                  </span>
                  <input
                    type="range"
                    min={0.02}
                    max={0.3}
                    step={0.005}
                    value={map.settings[key]}
                    onChange={(event) => setting(key, Number(event.target.value))}
                  />
                  <small>{hint}</small>
                </label>
              ))}
              <h4>Border reach by place</h4>
              {permanentSites.map((kind) => (
                <label className="reach-row" key={kind}>
                  <span className="reach-name">
                    <SiteIcon site={kind} size={16} />
                    {siteInfo[kind].name}
                  </span>
                  <input
                    type="range"
                    min={0.2}
                    max={3}
                    step={0.1}
                    value={map.settings.reachBy[kind]}
                    onChange={(event) => setReachBy(kind, Number(event.target.value))}
                  />
                  <output>×{map.settings.reachBy[kind].toFixed(1)}</output>
                </label>
              ))}
            </details>

            <details className="map-section">
              <summary>
                Map image <small>{map.image}</small>
              </summary>
              <label className="map-file">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => chooseImage(event.target.files?.[0])}
                />
                <span>Use a different image…</span>
              </label>
            </details>
          </div>
        </aside>
      )}
    </div>
  );
}
