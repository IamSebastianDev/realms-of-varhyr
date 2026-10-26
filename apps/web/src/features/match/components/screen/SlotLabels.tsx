import { CardFace } from "@realms/ui/CardPresentation";
import { Check, Moon, RotateCcw, Shield, Sparkles, Swords } from "lucide-react";
import { effectiveStats } from "@realms/core";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";
import { resolveDrop } from "../../lib/cardInteraction";

import { useMatch } from "../../MatchContext";

export function SlotLabels() {
  const {
    drag,
    dragDef,
    dropLane,
    dropPlay,
    dropZone,
    laneAt,
    live,
    selectedActivation,
    selectedLegal,
    slotLayout,
    stage,
    targets,
    undoable,
    view,
    viewer,
    visibleAttacks,
    visibleBlocks,
  } = useMatch();
  return (
    <>
      <div className="board-card-labels" aria-hidden="true">
        {slotLayout.map((slot) => {
          const id = view.players[slot.player].board[slot.slot],
            card = id ? view.cards[id] : null,
            def = card ? registry.cards[card.definitionId] : null,
            stats = id ? effectiveStats(view, id, registry) : null;
          const legal = drag
            ? resolveDrop(view, viewer, registry, drag.cardId, {
                player: slot.player,
                slot: slot.slot,
              })
            : null;
          const laneLegal = laneAt({ player: slot.player, slot: slot.slot }) !== null;
          const positionChoice =
            live &&
            stage === "position" &&
            slot.player === viewer &&
            (selectedActivation?.slots ?? selectedLegal?.slots)?.includes(slot.slot);
          const attackIndex = id ? visibleAttacks.indexOf(id) : -1,
            block = visibleBlocks.find((b) => b.blocker === id),
            blockIndex = block ? visibleAttacks.indexOf(block.attacker) : -1;
          const canUndo = !!id && undoable.includes(id);
          const canChannel = !!id && view.legal.energy.some((a) => a.cardId === id);
          const canActivate = !!id && view.legal.activations.some((a) => a.cardId === id);
          const over =
            (!!dropPlay || dropLane !== null) &&
            dropZone?.player === slot.player &&
            dropZone.slot === slot.slot;
          return (
            <div
              key={`${slot.player}-${slot.slot}`}
              data-battlefield-slot={`${slot.player}-${slot.slot}`}
              className={`board-card-label ${def?.legendary ? "is-legendary" : ""} ${attackIndex >= 0 ? "is-attacker" : ""} ${block ? "is-blocker" : ""} ${canUndo ? "is-channelled" : ""} ${card?.exhausted ? "is-exhausted" : ""} ${legal || laneLegal || positionChoice || (id && targets.includes(id)) ? "drop-legal" : ""} ${over ? "drop-over" : ""}`}
              style={{ left: slot.x, top: slot.y, width: slot.width, height: slot.height }}
            >
              {def && card && stats && (
                <>
                  <div
                    className={`art-card card-face-overlay ${def.legendary ? "legendary-card" : ""} ${def.type === "holding" ? "holding-card" : ""}`}
                  >
                    <CardFace
                      card={def}
                      stats={{
                        attack: stats.attack,
                        defense: Math.max(0, stats.defense - card.damage),
                      }}
                      showCost={false}
                    />
                  </div>
                  {attackIndex >= 0 ? (
                    <span
                      className="combat-role attacker-role"
                      title={msg("Attacker {v0}", { v0: attackIndex + 1 })}
                    >
                      <Swords />
                      {msg("Attack")} {attackIndex + 1}
                    </span>
                  ) : block ? (
                    <span
                      className="combat-role blocker-role"
                      title={msg("Blocks attacker {v0}", { v0: blockIndex + 1 })}
                    >
                      <Shield />
                      {msg("Blocks")} {blockIndex + 1}
                    </span>
                  ) : canUndo ? (
                    <span
                      className="board-status undo-status"
                      title={msg("Exhausted · click to undo channeling")}
                    >
                      <RotateCcw />
                    </span>
                  ) : canChannel ? (
                    <span
                      className="board-status ready-status"
                      title={
                        canActivate
                          ? msg("Ready · click to choose an action")
                          : msg("Ready · click to channel energy")
                      }
                    >
                      <Check />
                    </span>
                  ) : canActivate ? (
                    <span
                      className="board-status ready-status"
                      title={msg("Ready · click to activate")}
                    >
                      <Sparkles />
                    </span>
                  ) : (
                    card.exhausted && (
                      <span
                        className="board-status exhausted-status"
                        title={msg("Exhausted · can still block")}
                      >
                        <Moon />
                        <span>{msg("Exhausted")}</span>
                      </span>
                    )
                  )}
                </>
              )}
              {laneLegal && (
                <span className="drop-label">{id ? msg("Attack") : msg("Open lane")}</span>
              )}
              {legal && (
                <span className="drop-label">
                  {legal.consume
                    ? view.legal.playable.find((a) => a.cardId === legal.cardId)?.returns
                      ? msg("Return")
                      : msg("Consume")
                    : dragDef?.type === "spell"
                      ? legal.target
                        ? msg("Target")
                        : view.legal.playable.find((a) => a.cardId === legal.cardId)?.requiresTarget
                          ? msg("Choose target")
                          : msg("Cast")
                      : msg("Deploy")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
