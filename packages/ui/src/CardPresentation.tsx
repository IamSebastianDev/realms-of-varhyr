import { t as msg, useLanguage, localizedCard, localizedAbility } from "./i18n";
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { CardHoverDetail } from "./CardDetail";
import { useSingleLineName } from "./useSingleLineName";
import { FactionIcon, GenericEnergyIcon } from "@realms/renderer/FactionIcon";
import "./card.css";
import { CardArtwork } from "@realms/renderer/CardArtwork";
import { HolographicFoil } from "@realms/renderer/HolographicFoil";
import { Shield, Swords } from "lucide-react";
import type { CardDefinition, EnergyType, Pool } from "@realms/contracts";
import { factionInfo, registry } from "@realms/content";
import { usePreferences } from "./preferences";
export function cardAbilityDescriptions(card: CardDefinition) {
  // Printed abilities come first and keep their index (creature actions rely on it); spell effects follow.
  // `label` is for buttons: a one-off ability has no name, so its text stands in.
  return [
    ...card.abilities.map((binding) =>
      localizedAbility(binding, registry.abilities[binding.id], undefined, "field"),
    ),
    ...(card.cast ?? []).map((binding) =>
      localizedAbility(binding, registry.abilities[binding.id]),
    ),
  ].map((ability) => ({ ...ability, label: ability.name ?? ability.description }));
}
export function CardLore({ card, className = "" }: { card: CardDefinition; className?: string }) {
  useLanguage();
  card = localizedCard(card);
  return card.lore?.trim() ? (
    <blockquote className={`card-lore ${className}`} aria-label={msg("Lore")}>
      {card.lore}
    </blockquote>
  ) : null;
}
export function cardClassification(card: CardDefinition) {
  const subtypes = card.subtypes
    .map((subtype) => subtype.trim())
    .filter(Boolean)
    .map((subtype) => msg(subtype.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())));
  // Creatures lead with their subtypes. Spells and holdings keep their type first and add the subtype ("Spell · Divination", "Holding · Fortification").
  if (card.type === "creature" && subtypes.length) return subtypes.join(" · ");
  const label = msg(card.type.charAt(0).toUpperCase() + card.type.slice(1));
  return subtypes.length ? [label, ...subtypes].join(" · ") : label;
}
export function cardIdentity(card: CardDefinition) {
  const faction = card.factions.map((f) => msg(factionInfo[f].short)).join(" / ") || msg("Neutral");
  return msg("{v0} · {v1}", { v0: faction, v1: cardClassification(card) });
}
function hasEnergyCost(card: CardDefinition) {
  return card.cost.generic > 0 || Object.values(card.cost.factions).some((amount) => amount > 0);
}
export function Cost({ card }: { card: CardDefinition }) {
  useLanguage();
  if (!hasEnergyCost(card)) return null;
  return (
    <span className="cost-bundle">
      {card.cost.generic > 0 && (
        <span
          className="cost-generic"
          role="img"
          aria-label={`${card.cost.generic} ${msg("Generic: any energy")}`}
          title={msg("Generic: any energy")}
        >
          {card.cost.generic}
          <GenericEnergyIcon />
        </span>
      )}
      {Object.entries(card.cost.factions)
        .filter(([, amount]) => amount > 0)
        .map(([color, amount]) => (
          <span
            key={color}
            style={{ color: factionInfo[color as EnergyType].color }}
            title={msg(factionInfo[color as EnergyType].name)}
            role="img"
            aria-label={msg("{v0} {v1} energy", {
              v0: amount,
              v1: msg(factionInfo[color as EnergyType].name),
            })}
          >
            {amount}
            <FactionIcon faction={color} />
          </span>
        ))}
    </span>
  );
}
/** The cost on a card face: one coin per energy, each showing only its icon. */
export function CostCoins({ card }: { card: CardDefinition }) {
  useLanguage();
  const coins: { key: string; color?: string; label: string; faction?: string }[] = [];
  for (const [color, amount] of Object.entries(card.cost.factions))
    for (let i = 0; i < amount; i++)
      coins.push({
        key: `${color}${i}`,
        color: factionInfo[color as EnergyType].color,
        faction: color,
        label: msg(factionInfo[color as EnergyType].name),
      });
  if (card.cost.generic > 0)
    coins.push({ key: "generic", label: `${card.cost.generic} ${msg("Generic: any energy")}` });
  return (
    <span
      className="cost-bundle"
      role="img"
      aria-label={msg("Cost") + ": " + coins.map((coin) => coin.label).join(", ")}
    >
      {coins.map((coin) => (
        <span
          key={coin.key}
          className={coin.faction ? "cost-coin" : "cost-coin cost-generic"}
          style={coin.color ? { color: coin.color } : undefined}
          title={coin.label}
        >
          {coin.faction ? <FactionIcon faction={coin.faction} /> : card.cost.generic}
        </span>
      ))}
    </span>
  );
}
export function Energy({ pool }: { pool: Pool }) {
  useLanguage();
  const entries = Object.entries(pool).filter(([, v]) => v! > 0);
  return (
    <span className="energy-bundle">
      {entries.length ? (
        entries.map(([c, n]) => {
          const faction = factionInfo[c as EnergyType];
          const label =
            c === "neutral"
              ? msg("{v0} generic energy", { v0: n })
              : msg("{v0} {v1} energy", {
                  v0: n,
                  v1: c === "crownlands" ? msg("Crownlands") : msg(faction.name),
                });
          return (
            <span className="energy-token" key={c} title={label} aria-label={label}>
              {c === "neutral" ? (
                <GenericEnergyIcon className="energy-symbol" style={{ color: faction.color }} />
              ) : (
                <FactionIcon
                  className="energy-symbol"
                  faction={c}
                  style={{ color: faction.color }}
                />
              )}
              <b>{n}</b>
            </span>
          );
        })
      ) : (
        <span className="energy-empty">—</span>
      )}
    </span>
  );
}
export function EnergyOutput({ outputs }: { outputs: Pool[] }) {
  useLanguage();
  return (
    <span className="energy-output" aria-label={msg("Energy produced")}>
      {outputs.map((pool, i) => (
        <span className="output-option" key={i}>
          {i > 0 && <small className="output-or">{msg("or")}</small>}
          <Energy pool={pool} />
        </span>
      ))}
    </span>
  );
}
export function LegendaryMark() {
  useLanguage();
  return (
    <span className="legendary-mark" title={msg("Legendary · one copy per deck")}>
      {msg("Legendary")}
      <span className="sr-only"> {msg("· one copy per deck")}</span>
    </span>
  );
}
/** The printed face of a card (shade, cost, name, stats, energy). ArtCard puts it over the artwork; the board puts it over the 3D art. */
export function CardFace({
  card,
  stats,
  showCost = true,
}: {
  card: CardDefinition;
  stats?: { attack: number; defense: number };
  showCost?: boolean;
}) {
  useLanguage();
  card = localizedCard(card);
  const nameRef = useSingleLineName<HTMLHeadingElement>(card.name);
  const typeLine =
      card.type === "creature" && card.subtypes.some((subtype) => subtype.trim())
        ? msg("{v0} · {v1}", { v0: msg("Creature"), v1: cardClassification(card) })
        : cardClassification(card),
    typeRef = useSingleLineName<HTMLSpanElement>(typeLine);
  const tint = factionInfo[card.factions.find((f) => f !== "neutral") ?? card.factions[0]]?.color,
    tone = { "--faction": tint ?? "var(--ink)" } as React.CSSProperties;
  return (
    <>
      <div className="card-box">
        <div className="card-shade" style={tone} />
        <div className={`card-information type-${card.type}`} style={tone}>
          <div className="card-header">
            <h3 ref={nameRef}>{card.name}</h3>
            <div className="card-identity">
              <span className="card-affiliation" ref={typeRef}>
                {typeLine}
              </span>
            </div>
          </div>
          {card.type !== "spell" && (
            <div className="card-title">
              <div className="card-statline">
                <span title={card.type === "holding" ? msg("Defensive damage") : msg("Attack")}>
                  <Swords />
                  {stats?.attack ?? card.stats!.attack}
                </span>
                <span title={msg("Defense")}>
                  <Shield />
                  {stats?.defense ?? card.stats!.defense}
                </span>
              </div>
              {card.type === "creature" && card.stats!.energyOutputs.length > 0 && (
                <div className="card-energy-output">
                  <EnergyOutput outputs={card.stats!.energyOutputs} />
                </div>
              )}
            </div>
          )}
          {card.type === "spell" && (
            <div className="card-title is-spacer" aria-hidden="true">
              <div className="card-statline">
                <span>
                  <Swords />0
                </span>
              </div>
            </div>
          )}
        </div>
        <span className={`card-corners type-${card.type}`} style={tone} />
      </div>
      {showCost && hasEnergyCost(card) && (
        <span className="card-cost">
          <CostCoins card={card} />
        </span>
      )}
    </>
  );
}
export function ArtCard({
  card,
  onClick,
  selected = false,
  disabled = false,
  className = "",
  stats,
  interaction,
  animated = false,
  reduced = false,
  detail = true,
}: {
  card: CardDefinition;
  /** Show the hover detail panel. On by default for every card; off where the caller supplies its own (hand, board) or the card is already shown in detail. */ detail?: boolean;
  animated?: boolean;
  reduced?: boolean;
  interaction?: Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    | "id"
    | "style"
    | "title"
    | "aria-label"
    | "aria-disabled"
    | "onContextMenu"
    | "onPointerDown"
    | "onDoubleClick"
    | "onPointerEnter"
    | "onPointerLeave"
    | "onFocus"
    | "onBlur"
  >;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  stats?: { attack: number; defense: number };
}) {
  useLanguage();
  card = localizedCard(card);
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [hoverRect, setHoverRect] = useState<DOMRect | null>(null),
    hoverTimer = useRef(0);
  const showDetail = (element: HTMLElement) => {
    if (!detail) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(
      () => setHoverRect(element.getBoundingClientRect()),
      350,
    );
  };
  const hideDetail = () => {
    window.clearTimeout(hoverTimer.current);
    setHoverRect(null);
  };
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const tilt = (e: React.PointerEvent<HTMLElement>) => {
    if (reduced || e.pointerType === "touch") return;
    const el = e.currentTarget,
      r = el.getBoundingClientRect();
    el.style.setProperty(
      "--px",
      String(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)).toFixed(3)),
    );
    el.style.setProperty(
      "--py",
      String(Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2)).toFixed(3)),
    );
  };
  const untilt = (el: HTMLElement) => {
    el.style.removeProperty("--px");
    el.style.removeProperty("--py");
  };
  const preview = hoverRect && <CardHoverDetail card={card} rect={hoverRect} reduced={reduced} />;
  const body = (
    <>
      <div className="card-art">
        <CardArtwork
          art={card.art}
          animation={card.animation}
          alt={msg("{v0} illustration", { v0: card.name })}
          playing={animated || hovered || focused}
          reduced={reduced}
        />
        {card.legendary && (
          <HolographicFoil playing={animated || hovered || focused} reduced={reduced} />
        )}
      </div>
      <CardFace card={card} stats={stats} />
    </>
  );
  return onClick ? (
    <button
      {...interaction}
      onPointerMove={tilt}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") {
          setHovered(true);
          showDetail(e.currentTarget);
        }
        interaction?.onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        setHovered(false);
        hideDetail();
        untilt(e.currentTarget);
        interaction?.onPointerLeave?.(e);
      }}
      onPointerDown={(e) => {
        hideDetail();
        interaction?.onPointerDown?.(e);
      }}
      onFocus={(e) => {
        setFocused(true);
        if (e.currentTarget.matches(":focus-visible")) showDetail(e.currentTarget);
        interaction?.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        hideDetail();
        interaction?.onBlur?.(e);
      }}
      className={`art-card ${card.legendary ? "legendary-card" : ""} ${card.type === "holding" ? "holding-card" : ""} ${className} ${selected ? "selected" : ""} ${disabled ? "unaffordable" : ""}`}
      onClick={() => {
        hideDetail();
        onClick();
      }}
      aria-label={
        interaction?.["aria-label"] ??
        msg("{v0}, {v1}{v2}. {v3}", {
          v0: card.name,
          v1: card.legendary ? msg("legendary") + " " : "",
          v2: msg(card.type),
          v3: [card.lore, ...cardAbilityDescriptions(card).map((ability) => ability.description)]
            .filter(Boolean)
            .join(" "),
        })
      }
      aria-pressed={interaction?.["aria-label"] ? undefined : selected}
    >
      {body}
      {preview}
    </button>
  ) : (
    <div
      className={`art-card ${card.legendary ? "legendary-card" : ""} ${card.type === "holding" ? "holding-card" : ""} ${className}`}
      onPointerMove={tilt}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") showDetail(e.currentTarget);
      }}
      onPointerLeave={(e) => {
        hideDetail();
        untilt(e.currentTarget);
      }}
      onPointerDown={hideDetail}
    >
      {body}
      {preview}
    </div>
  );
}
export function CardFacts({
  card,
  stats,
}: {
  card: CardDefinition;
  stats?: { attack: number; defense: number };
}) {
  useLanguage();
  card = localizedCard(card);
  const abilities = cardAbilityDescriptions(card);
  return (
    <div className="card-facts">
      {card.legendary && <LegendaryMark />}
      {card.type !== "spell" && (
        <>
          <div className="fact-stats">
            <span>
              <Swords size={14} />
              <b>{stats?.attack ?? card.stats!.attack}</b>{" "}
              {card.type === "holding" ? msg("Defensive damage") : msg("Attack")}
            </span>
            <span>
              <Shield size={14} />
              <b>{stats?.defense ?? card.stats!.defense}</b> {msg("Defense")}
            </span>
          </div>
          {card.type === "creature" ? (
            card.stats!.energyOutputs.length ? (
              <div className="fact-energy">
                <span>{msg("ENERGY OUTPUT")}</span>
                <EnergyOutput outputs={card.stats!.energyOutputs} />
              </div>
            ) : (
              <p className="no-energy-output">{msg("No printed energy output.")}</p>
            )
          ) : (
            <p className="holding-rules">
              <Shield size={16} />
              {msg("Can block · cannot attack or generate energy.")}
            </p>
          )}
        </>
      )}
      {abilities.length > 0 && (
        <dl
          className="ability-facts"
          aria-label={card.type === "spell" ? msg("Spell effects") : msg("Abilities")}
        >
          {abilities.map((ability, index) => (
            <div className="ability-fact" key={index}>
              {ability.name && <dt>{ability.name}</dt>}
              <dd>{ability.description}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function CardListName({ name }: { name: string }) {
  useLanguage();
  const ref = useSingleLineName<HTMLSpanElement>(msg(name));
  return (
    <span ref={ref} className="card-list-name">
      {msg(name)}
    </span>
  );
}

/** Wraps a button that stands for a card (a list row) so it shows the same hover detail as a card tile. */
export function CardHoverButton({
  card,
  onClick,
  className,
  ariaLabel,
  children,
}: {
  card: CardDefinition;
  onClick: () => void;
  className: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  useLanguage();
  const { reduced } = usePreferences();
  const [rect, setRect] = useState<DOMRect | null>(null),
    timer = useRef(0);
  const show = (element: HTMLElement) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRect(element.getBoundingClientRect()), 350);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setRect(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      className={className}
      aria-label={ariaLabel}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") show(e.currentTarget);
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget);
      }}
      onBlur={hide}
      onClick={() => {
        hide();
        onClick();
      }}
    >
      {children}
      {rect && <CardHoverDetail card={card} rect={rect} reduced={reduced} />}
    </button>
  );
}
