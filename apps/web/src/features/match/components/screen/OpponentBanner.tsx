import { Avatar } from "../../../../components/Avatar";
import { BookOpen, Heart, Zap } from "lucide-react";
import { DiscardCount, FitName, HandCount, LayersIcon, LibraryCount } from "../MatchParts";
import { Energy } from "@realms/ui/CardPresentation";
import { cardBackById } from "../../../card-backs/lib/cardBacks";
import { t as msg } from "@realms/ui/i18n";
import { other } from "@realms/core";
import { playerName } from "../../lib/matchText";
import { registry } from "@realms/content";
import { resolveDrop } from "../../lib/cardInteraction";

import { useMatch } from "../../MatchContext";

export function OpponentBanner() {
  const {
    artFor,
    choosePlayerTarget,
    discardTop,
    drag,
    enemyPlayerRef,
    enemyPoolRef,
    energyFlights,
    factionSymbol,
    live,
    opponent,
    playerDropClass,
    responseStep,
    sendTarget,
    setPanel,
    targets,
    view,
    viewer,
  } = useMatch();
  return (
    <>
      <div
        ref={enemyPlayerRef}
        className={`player-banner opponent ${playerDropClass(other(viewer))}`}
        onClickCapture={(event) => choosePlayerTarget(other(viewer), event)}
      >
        <div className="player-id">
          <div className="portrait">
            <button
              className={`avatar enemy-avatar ${artFor(other(viewer)) ? "has-art" : ""}`}
              aria-label={msg("Target opponent")}
              disabled={
                !live ||
                (!targets.includes(other(viewer)) &&
                  !(
                    drag &&
                    resolveDrop(view, viewer, registry, drag.cardId, { player: other(viewer) })
                  ))
              }
              onClick={() => sendTarget(other(viewer))}
            >
              {artFor(other(viewer)) ? (
                <Avatar id={artFor(other(viewer))!} />
              ) : (
                factionSymbol(other(viewer))
              )}
            </button>
            <div className="life-counter">
              <Heart size={11} aria-hidden="true" />
              <strong>{opponent.life}</strong>
              <small>{msg("LIFE")}</small>
            </div>
          </div>
          <div className="player-name">
            <FitName name={playerName(opponent.name)} />
          </div>
          <div
            ref={enemyPoolRef}
            title={msg("Energy pool")}
            className={`energy-meter opponent-pool ${responseStep && view.active === viewer ? "response-pool" : ""} ${energyFlights.some((f) => f.player === other(viewer)) ? "receiving-energy" : ""}`}
          >
            <Zap className="pool-icon" size={17} />
            {responseStep && view.active === viewer && (
              <span className="eyebrow">{msg("RESPONSE ENERGY")}</span>
            )}
            <Energy
              pool={
                responseStep && view.active === viewer ? opponent.responseEnergy : opponent.energy
              }
            />
          </div>
          <div className="player-meta">
            <span title={msg("Cards in hand")}>
              <BookOpen size={13} />
              {opponent.handCount}
            </span>
            <span title={msg("Cards in deck")}>
              <LayersIcon />
              {opponent.deckCount}
            </span>
          </div>
        </div>
        <div className="piles">
          <HandCount count={opponent.handCount} player={opponent.id} />
          <LibraryCount
            count={opponent.deckCount}
            back={cardBackById(opponent.cardBack).id}
            player={opponent.id}
          />
          <DiscardCount
            count={opponent.discard.length}
            top={discardTop(opponent.discard)}
            onOpen={() => setPanel("discard")}
          />
        </div>
      </div>
    </>
  );
}
