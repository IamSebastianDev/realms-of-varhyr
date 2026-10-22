import { ClashLayer } from "../ClashLayer";
import { EnergyFlow } from "../EnergyFlow";
import { FactionAbilityEffects } from "../FactionAbilityEffects";
import { SpellCast } from "../SpellCast";
import { factionAuras } from "../../lib/factionEffects";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

export function FightEffects() {
  const {
    boardRef,
    clash,
    clashBatches,
    covered,
    energyFlights,
    factionEffects,
    panel,
    reduced,
    setClash,
    slotLayout,
    spellCasts,
    view,
    viewer,
  } = useMatch();
  return (
    <>
      {!covered && !panel && !view.outcome && (
        <FactionAbilityEffects
          auras={clash ? [] : factionAuras(view, registry)}
          bursts={factionEffects}
          board={boardRef.current}
          slots={slotLayout}
          viewer={viewer}
          reduced={reduced}
        />
      )}
      <EnergyFlow flights={energyFlights} />
      <SpellCast casts={spellCasts} />
      <ClashLayer
        batches={clashBatches}
        board={boardRef.current}
        slots={slotLayout}
        viewer={viewer}
        onSkip={clash ? () => setClash(null) : undefined}
      />
    </>
  );
}
