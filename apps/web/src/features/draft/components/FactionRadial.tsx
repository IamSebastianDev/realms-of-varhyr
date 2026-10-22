import { t as msg, useLanguage } from "@realms/ui/i18n";
import { factions as namedFactions } from "@realms/content/factions";
import { FactionIcon } from "@realms/renderer/FactionIcon";
import { factionInfo } from "@realms/content";
import { factionColor, factionName, hybridPartners } from "../lib/factionTools";

/** The factions on a ring, the way the hybrid chain reads. The one in the middle is the one you start with. */
export function FactionRadial({
  selected,
  ready,
  choose,
}: {
  selected: string;
  ready: string[];
  choose: (faction: string) => void;
}) {
  useLanguage();
  const step = 360 / namedFactions.length;
  return (
    <div className="faction-radial" role="radiogroup" aria-label={msg("Choose your faction")}>
      <div
        className="faction-radial-core"
        style={{ ["--tint" as string]: factionColor(selected) }}
        aria-hidden
      >
        <FactionIcon faction={selected} />
      </div>
      {namedFactions.map((faction, index) => {
        const on = ready.includes(faction),
          angle = ((index * step - 90) * Math.PI) / 180;
        return (
          <button
            key={faction}
            role="radio"
            aria-checked={faction === selected}
            disabled={!on}
            title={
              on
                ? msg(factionName(faction))
                : `${msg(factionName(faction))} · ${msg("Not ready to draft yet")}`
            }
            aria-label={msg(factionName(faction))}
            className="faction-radial-node"
            style={{
              ["--tint" as string]: factionColor(faction),
              left: `${50 + Math.cos(angle) * 40}%`,
              top: `${50 + Math.sin(angle) * 40}%`,
            }}
            onClick={() => choose(faction)}
          >
            <FactionIcon faction={faction} />
          </button>
        );
      })}
    </div>
  );
}

/** The faction's side panel: how it plays in the draft, as the faction's own file describes it, and where its hybrids lead. */
export function FactionExplain({ faction, ready }: { faction: string; ready: boolean }) {
  useLanguage();
  const guide = factionInfo[faction]?.draft,
    partners = hybridPartners(faction);
  return (
    <div className="faction-explain" aria-live="polite">
      <h2>{msg(factionName(faction))}</h2>
      {!ready && <p className="draft-stripe-status">{msg("Not ready to draft yet")}</p>}
      {guide ? (
        <p className="faction-guide">{msg(guide)}</p>
      ) : (
        <p className="faction-guide">{msg("Nothing written about this faction yet.")}</p>
      )}
      <p>
        {partners.length
          ? msg("Hybrids with {v0}", {
              v0: partners.map((entry) => msg(factionName(entry.faction))).join(" · "),
            })
          : msg("No hybrids yet")}
      </p>
      <p>
        {msg(
          "Every booster you open in the first half is this faction. Hybrids you pick can only be played with their other faction.",
        )}
      </p>
    </div>
  );
}
