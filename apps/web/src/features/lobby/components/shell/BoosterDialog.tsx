import { BoosterOpening } from "../../../boosters/components/BoosterOpening";
import { packCount } from "../../../collection/lib/collection";

import { useLobbyContext } from "../../LobbyContext.tsx";

export function BoosterDialog() {
  const { booster, collection, inspect, inspected, navigate, openBooster, props, setBooster } =
    useLobbyContext();
  return (
    <>
      {booster && (
        <BoosterOpening
          key={booster.id}
          pack={booster}
          reduced={props.reduced}
          suspended={!!inspected}
          close={() => setBooster(null)}
          openAnother={() => openBooster(booster.pack)}
          canOpenAnother={packCount(collection, booster.pack.id) > 0}
          inspect={inspect}
          browse={() => {
            setBooster(null);
            navigate("cards");
          }}
        />
      )}
    </>
  );
}
