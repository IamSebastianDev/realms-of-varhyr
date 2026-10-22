import type { SelectHTMLAttributes } from "react";
import { factionInfo } from "@realms/content";
import { FactionIcon } from "@realms/renderer/FactionIcon";
import { t as msg, useLanguage } from "@realms/ui/i18n";

/** Native keyboard/mobile selection, with a matching emblem on the selected faction. */
export function FactionSelect({
  value = "all",
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "children">) {
  useLanguage();
  const faction = typeof value === "string" ? factionInfo[value] : undefined;
  return (
    <span className={`faction-select ${faction ? "has-faction" : ""}`}>
      {faction && <FactionIcon faction={String(value)} style={{ color: faction.color }} />}
      <select
        {...props}
        value={value}
        style={faction ? { ...props.style, paddingInlineStart: 35 } : props.style}
      >
        <option value="all">{msg("All factions")}</option>
        {Object.entries(factionInfo).map(([id, f]) => (
          <option key={id} value={id}>
            {msg(f.name)}
          </option>
        ))}
      </select>
    </span>
  );
}
