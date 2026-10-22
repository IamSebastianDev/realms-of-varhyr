import { useMatch } from "../../MatchContext";

export function TurnBanner() {
  const { banner } = useMatch();
  return (
    <>
      {banner && (
        <div key={banner.id} className={`turn-banner ${banner.tone}`} aria-hidden="true">
          <span>{banner.text}</span>
        </div>
      )}
    </>
  );
}
