import { Heart, Shield, Skull } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";

import { useMatch } from "../../MatchContext";

export function CombatForecast() {
  const { forecast, thinking, view, viewer } = useMatch();
  return (
    <>
      {forecast && (!thinking || view.combat?.stage === "review") && (
        <span
          className="combat-forecast"
          aria-label={msg(
            "{v0} blocked, {v1} defenders and {v2} attackers lost, {v3} life damage",
            {
              v0: forecast.blocked,
              v1: forecast.fallen,
              v2: forecast.attackersFallen,
              v3: forecast.lifeDamage,
            },
          )}
        >
          {(() => {
            const mine = view.active === viewer,
              lostOwn = mine ? forecast.attackersFallen : forecast.fallen,
              lostFoe = mine ? forecast.fallen : forecast.attackersFallen;
            return (
              <>
                {forecast.blocked > 0 && (
                  <i title={msg("Blocked attackers")}>
                    <Shield size={12} />
                    {forecast.blocked}
                  </i>
                )}
                {lostFoe > 0 && (
                  <i className="good" title={msg("Enemy cards destroyed")}>
                    <Skull size={12} />
                    {lostFoe}
                  </i>
                )}
                {lostOwn > 0 && (
                  <i className="bad" title={msg("Your cards destroyed")}>
                    <Skull size={12} />
                    {lostOwn}
                  </i>
                )}
                {forecast.lifeDamage > 0 && (
                  <i className={mine ? "good" : "bad"} title={msg("Life damage")}>
                    <Heart size={12} />−{forecast.lifeDamage}
                  </i>
                )}
              </>
            );
          })()}
        </span>
      )}
    </>
  );
}
