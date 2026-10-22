import { ArrowLeft, Gift, House, Layers, Package, Settings, User } from "lucide-react";
import { CountBadge } from "../../../../components/CountBadge";
import { CrownAmount } from "../../../../components/Crowns";
import { t as msg } from "@realms/ui/i18n";

import { useLobbyContext } from "../../LobbyContext.tsx";

export function LobbyHeader() {
  const { boostersAvailable, canResume, collection, isHome, navigate, screen, setup } =
    useLobbyContext();
  return (
    <>
      <header className="lobby-header" inert={setup !== null}>
        <button className="brand" onClick={() => navigate("menu")} aria-label={msg("Main menu")}>
          <span className="brand-mark">
            V<span />
          </span>
          <span>
            <small>REALMS OF</small>
            <strong>VARHYR</strong>
          </span>
        </button>
        <nav aria-label={msg("Main navigation")}>
          <button className={isHome ? "active" : ""} onClick={() => navigate("menu")}>
            <House size={18} />
            {msg("Menu")}
          </button>
          <button
            className={
              screen === "cards" || screen === "builder" || screen === "stats" ? "active" : ""
            }
            onClick={() => navigate("builder")}
          >
            <Layers size={18} />
            {msg("Decks")}
          </button>
          <button
            className={screen === "packs" ? "active" : ""}
            aria-label={
              boostersAvailable > 0
                ? `${msg("Packs")}, ${msg("{v0} boosters waiting", { v0: boostersAvailable })}`
                : undefined
            }
            onClick={() => navigate("packs")}
          >
            <Package size={18} />
            {msg("Packs")}
            {boostersAvailable > 0 && <CountBadge count={boostersAvailable} />}
          </button>
          <button className={screen === "store" ? "active" : ""} onClick={() => navigate("store")}>
            <Gift size={18} />
            {msg("Store")}
          </button>
          <button
            className={screen === "profile" ? "active" : ""}
            onClick={() => navigate("profile")}
          >
            <User size={18} />
            {msg("Profile")}
          </button>
        </nav>
        <button
          className="collection-wallet-pill"
          aria-label={msg("Open store, {v0} crowns, {v1} boosters", {
            v0: collection.crowns,
            v1: boostersAvailable,
          })}
          onClick={() => navigate("store")}
        >
          <CrownAmount amount={collection.crowns} />
          <span className="wallet-pack-count">
            <Gift size={14} />
            {boostersAvailable}
          </span>
        </button>
        <button
          className={`lobby-settings ${screen === "settings" ? "active" : ""}`}
          aria-label={msg("Settings")}
          title={msg("Settings")}
          onClick={() => navigate("settings")}
        >
          <Settings size={17} />
        </button>
        {canResume && (
          <button
            className="lobby-resume"
            aria-label={msg("Return to match")}
            onClick={() => navigate("match")}
          >
            <ArrowLeft size={15} />
            {msg("Return to match")}
          </button>
        )}
      </header>
    </>
  );
}
