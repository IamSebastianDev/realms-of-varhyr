import { Avatar } from "../../../../components/Avatar";
import { DiscardCount, FitName, HandCount, LayersIcon, LibraryCount } from "../MatchParts";
import { Energy } from "@realms/ui/CardPresentation";
import { Heart, Zap } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";
import { playerName } from "../../lib/matchText";

import { useMatch } from "../../MatchContext";

export function OwnBanner() {
  const {
    artFor,
    choosePlayerTarget,
    discardTop,
    energyFlights,
    factionSymbol,
    hotseat,
    ownBack,
    ownPlayerRef,
    playerDropClass,
    poolRef,
    responseStep,
    setPanel,
    view,
    viewer,
    you,
  } = useMatch();
  return (
    <>
      <div
        ref={ownPlayerRef}
        className={`player-banner own ${playerDropClass(viewer)}`}
        onClickCapture={(event) => choosePlayerTarget(viewer, event)}
      >
        <div className="player-id">
          <div className="portrait">
            <div className={`avatar ${artFor(viewer) ? "has-art" : ""}`}>
              {artFor(viewer) ? <Avatar id={artFor(viewer)!} /> : factionSymbol(viewer)}
            </div>
            <div className="life-counter">
              <Heart size={11} aria-hidden="true" />
              <strong>{you.life}</strong>
              <small>{msg("LIFE")}</small>
            </div>
          </div>
          <div className="player-name">
            {hotseat && viewer !== "p1" && <span className="eyebrow">{msg("PLAYER TWO")}</span>}
            <FitName name={playerName(you.name)} />
          </div>
          <div
            ref={poolRef}
            title={msg("Energy pool")}
            className={`energy-meter ${responseStep && view.active !== viewer ? "response-pool" : ""} ${energyFlights.some((f) => f.player === viewer) ? "receiving-energy" : ""}`}
          >
            <Zap className="pool-icon" size={20} />
            {responseStep && view.active !== viewer && (
              <span className="eyebrow">{msg("RESPONSE ENERGY")}</span>
            )}
            <Energy
              pool={responseStep && view.active !== viewer ? you.responseEnergy : you.energy}
            />
          </div>
          <div className="player-meta">
            <span title={msg("Deck")}>
              <LayersIcon />
              {you.deckCount}
            </span>
          </div>
        </div>
        <div className="piles">
          <HandCount count={you.handCount} />
          <LibraryCount count={you.deckCount} back={ownBack} />
          <DiscardCount
            count={you.discard.length}
            top={discardTop(you.discard)}
            onOpen={() => setPanel("discard")}
          />
        </div>
      </div>
    </>
  );
}
