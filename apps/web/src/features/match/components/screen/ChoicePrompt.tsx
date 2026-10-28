import { choiceBanner } from "../../lib/choiceBanner";
import { useMatch } from "../../MatchContext";

/** Big text over the battlefield telling the player what the game is waiting for them to pick on the board. */
export function ChoicePrompt() {
  const { damagePick, draft, live, selectedLegal, stage, view } = useMatch();
  const banner = live
    ? choiceBanner({ view, stage, draft, damagePick, returns: !!selectedLegal?.returns })
    : null;
  if (!banner) return null;
  return (
    <div className="choice-prompt" role="status">
      <div className="choice-band">
        <strong>{banner.text}</strong>
        {banner.source && <span>{banner.source}</span>}
      </div>
    </div>
  );
}
