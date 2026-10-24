import { Energy, cardAbilityDescriptions } from "@realms/ui/CardPresentation";
import { type EnergyAction, EnergyChoiceArc } from "../EnergyChoiceArc";
import { Eye, RotateCcw, Sparkles, Swords, X, Zap } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";
import { positionName } from "@realms/contracts";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

export function CreatureActions() {
  const {
    actionCard,
    actionInstance,
    actionPopoverRef,
    actionPosition,
    availableActions,
    covered,
    energyAnchor,
    inspectBoard,
    laneOccupant,
    live,
    panel,
    performCreatureAction,
    reduced,
    setActionCard,
    useEnergyArc,
    view,
  } = useMatch();
  return (
    <>
      {actionCard && actionInstance && live && !covered && !panel && useEnergyArc && (
        <EnergyChoiceArc
          cardName={msg(registry.cards[actionInstance.definitionId].name)}
          actions={availableActions as EnergyAction[]}
          getAnchor={energyAnchor}
          containerRef={actionPopoverRef}
          reduced={reduced}
          onClose={() => setActionCard(null)}
          onChoose={(action) => performCreatureAction(actionCard, action)}
          actionName={(action) =>
            action.kind === "channel"
              ? msg("Channel")
              : cardAbilityDescriptions(registry.cards[actionInstance.definitionId])[action.ability]
                  .label
          }
        />
      )}
      {actionCard && actionInstance && live && !covered && !panel && !useEnergyArc && (
        <div
          ref={actionPopoverRef}
          className="creature-actions"
          role="dialog"
          aria-label={msg("{v0} actions", { v0: registry.cards[actionInstance.definitionId].name })}
          style={{ ...actionPosition, maxHeight: window.innerHeight - actionPosition.top - 12 }}
        >
          <div className="creature-actions-heading">
            <span>{msg(registry.cards[actionInstance.definitionId].name)}</span>
            <button aria-label={msg("Close card actions")} onClick={() => setActionCard(null)}>
              <X size={14} />
            </button>
          </div>
          {availableActions.map((action, i) => (
            <button
              autoFocus={i === 0}
              key={i}
              className="inline-creature-action"
              onClick={() => performCreatureAction(actionCard, action)}
            >
              {action.kind === "channel" ? (
                <>
                  <Zap size={15} />
                  <span>{msg("Channel")}</span>
                  <Energy pool={action.output} />
                </>
              ) : action.kind === "activate" ? (
                <>
                  <Sparkles size={15} />
                  <span>
                    {
                      cardAbilityDescriptions(registry.cards[actionInstance.definitionId])[
                        action.ability
                      ].label
                    }
                  </span>
                  {action.output && <Energy pool={action.output} />}
                </>
              ) : action.kind === "undo-channel" ? (
                <>
                  <RotateCcw size={15} />
                  {msg("Undo channel")}
                </>
              ) : action.kind === "attack" ? (
                <>
                  <Swords size={15} />
                  <span>
                    {action.current ? msg("Attacking") : msg("Attack")} ·{" "}
                    {msg(positionName(action.lane) ?? "")}
                  </span>
                  <small>{laneOccupant(action.lane)}</small>
                </>
              ) : (
                <>
                  <RotateCcw size={15} />
                  {msg("Withdraw attack")}
                </>
              )}
            </button>
          ))}
          <button className="inline-inspect-action" onClick={() => inspectBoard(actionCard)}>
            <Eye size={13} />
            {msg("Inspect card")}
          </button>
          <small>
            {view.combat?.stage === "declare"
              ? msg("Choose a lane to attack.")
              : msg("Choose an action.")}
          </small>
        </div>
      )}
    </>
  );
}
