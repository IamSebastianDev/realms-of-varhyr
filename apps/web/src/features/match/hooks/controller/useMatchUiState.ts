import { type Draft, type PreviewRequest } from "../../lib/matchTypes";
import { type PlayerId } from "@realms/contracts";
import { type SlotLayout } from "@realms/renderer/Board";
import { decisionPlayer } from "@realms/core";
import { useRef, useState } from "react";

import type { useMatchBasics } from "./useMatchBasics";

/** Selections, open panels, refs to the board and every other piece of screen-local state. */
export function useMatchUiState(c: ReturnType<typeof useMatchBasics>) {
  const { historySteps, sessionSnapshot, state, watching } = c;
  const [viewer, setViewer] = useState<PlayerId>(sessionSnapshot.seat ?? decisionPlayer(state)),
    [covered, setCovered] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [, setHovered] = useState<string | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [stage, setStage] = useState<"none" | "mode" | "consume" | "position" | "target">("none");
  const [attackers, setAttackers] = useState<string[]>([]),
    [lanes, setLanes] = useState<Record<string, number>>({});
  const [mulliganPick, setMulliganPick] = useState<string[]>([]),
    [logOpen, setLogOpen] = useState(false),
    [panel, setPanel] = useState<
      "rules" | "menu" | "settings" | "journal" | "debug" | "discard" | null
    >(null),
    [error, setError] = useState("");
  const [confirmConcede, setConfirmConcede] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null),
    enemyPlayerRef = useRef<HTMLDivElement>(null),
    ownPlayerRef = useRef<HTMLDivElement>(null);
  const poolRef = useRef<HTMLDivElement>(null),
    enemyPoolRef = useRef<HTMLDivElement>(null),
    previewRef = useRef<HTMLElement>(null);
  const actionPopoverRef = useRef<HTMLDivElement>(null);
  const [actionCard, setActionCard] = useState<string | null>(null);
  const [slotLayout, setSlotLayout] = useState<SlotLayout[]>([]),
    [previewRequest, setPreviewRequest] = useState<PreviewRequest | null>(null),
    [preview, setPreview] = useState<PreviewRequest | null>(null);
  const [historyIndex, setHistoryIndex] = useState<number | null>(watching ? 0 : null),
    [autoplay, setAutoplay] = useState(false);
  const historyLength = historySteps.length;
  return {
    viewer,
    setViewer,
    covered,
    setCovered,
    selected,
    setSelected,
    setHovered,
    draft,
    setDraft,
    stage,
    setStage,
    attackers,
    setAttackers,
    lanes,
    setLanes,
    mulliganPick,
    setMulliganPick,
    logOpen,
    setLogOpen,
    panel,
    setPanel,
    error,
    setError,
    confirmConcede,
    setConfirmConcede,
    boardRef,
    enemyPlayerRef,
    ownPlayerRef,
    poolRef,
    enemyPoolRef,
    previewRef,
    actionPopoverRef,
    actionCard,
    setActionCard,
    slotLayout,
    setSlotLayout,
    previewRequest,
    setPreviewRequest,
    preview,
    setPreview,
    historyIndex,
    setHistoryIndex,
    autoplay,
    setAutoplay,
    historyLength,
  };
}
