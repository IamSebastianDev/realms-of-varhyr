import { t as msg, useLanguage } from "@realms/ui/i18n";
import { useState, type CSSProperties } from "react";
import { Check, Pencil } from "lucide-react";
import { Avatar } from "../../../components/Avatar";
import {
  avatars,
  defaultAvatarId,
  defaultName,
  maxNameLength,
  updateProfile,
  useProfile,
} from "../stores/profile";
import { useCollection } from "../../collection/stores/collectionStore";
import { totalPacks } from "../../collection/lib/collection";
import { AchievementsPanel } from "../../goals/components/AchievementsPanel";
import { SleeveBrowser } from "../../card-backs/components/SleeveBrowser";

export function ProfilePage() {
  useLanguage();
  const profile = useProfile(),
    { collection } = useCollection();
  const [name, setName] = useState(profile.name === defaultName ? "" : profile.name);
  const [tab, setTab] = useState<"portrait" | "sleeves" | "achievements">("portrait");
  const chosen =
    avatars.find((a) => a.id === profile.avatar) ?? avatars.find((a) => a.id === defaultAvatarId)!;
  const owned = Object.values(collection.counts).reduce((sum, count) => sum + count, 0);
  const facts: [string, number][] = [
    [msg("Victories"), collection.rewardedMatches.length],
    [msg("Cards owned"), owned],
    [msg("Boosters opened"), collection.boostersOpened],
    [msg("Boosters waiting"), totalPacks(collection)],
  ];
  return (
    <main className="profile-page profile-hall" aria-label={msg("Profile")}>
      <section className="profile-stage" style={{ "--avatar": chosen.accent } as CSSProperties}>
        <header className="profile-bar">
          <h1>{msg("Profile")}</h1>
          <div className="profile-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "portrait"}
              onClick={() => setTab("portrait")}
            >
              {msg("Portrait")}
            </button>
            <button role="tab" aria-selected={tab === "sleeves"} onClick={() => setTab("sleeves")}>
              {msg("Sleeves")}
            </button>
            <button
              role="tab"
              aria-selected={tab === "achievements"}
              onClick={() => setTab("achievements")}
            >
              {msg("Achievements")}
            </button>
          </div>
        </header>
        <div className="profile-body">
          <section className="profile-identity" aria-label={msg("Your profile")}>
            <div className="profile-portrait">
              <Avatar id={chosen.id} size={190} />
            </div>
            <div className="profile-fields">
              <label>
                {msg("Name")}
                <span className="name-input">
                  <input
                    value={name}
                    maxLength={maxNameLength}
                    placeholder={defaultName}
                    aria-label={msg("Player name")}
                    autoComplete="off"
                    onChange={(event) => {
                      setName(event.target.value);
                      updateProfile({ name: event.target.value });
                    }}
                    onBlur={() => setName(profile.name === defaultName ? "" : profile.name)}
                  />
                  <Pencil size={17} aria-hidden="true" />
                </span>
              </label>
              <small>{msg("Shown to your opponent and on your side of the battlefield.")}</small>
            </div>
            <dl className="profile-facts">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {tab === "achievements" ? (
            <AchievementsPanel />
          ) : tab === "sleeves" ? (
            <SleeveBrowser />
          ) : (
            <section className="profile-avatars" aria-label={msg("Choose an avatar")}>
              <h2>{msg("Choose your portrait")}</h2>
              <div role="radiogroup" aria-label={msg("Avatar")}>
                {avatars.map((choice) => (
                  <button
                    key={choice.id}
                    role="radio"
                    aria-checked={choice.id === chosen.id}
                    aria-label={msg("{v0}, {v1}", { v0: choice.name, v1: choice.title })}
                    title={msg(choice.name)}
                    className={choice.id === chosen.id ? "on" : ""}
                    onClick={() => updateProfile({ avatar: choice.id })}
                  >
                    <Avatar id={choice.id} />
                    {choice.id === chosen.id && (
                      <i>
                        <Check size={12} />
                      </i>
                    )}
                  </button>
                ))}
              </div>
              <article
                className="avatar-lore"
                style={{ "--avatar": chosen.accent } as CSSProperties}
              >
                <h3>{msg(chosen.name)}</h3>
                <p className="avatar-title">{msg(chosen.title)}</p>
                <p>{msg(chosen.lore)}</p>
              </article>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
