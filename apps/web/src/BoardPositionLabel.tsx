import { t as msg, useLanguage } from "@realms/ui/i18n";
import { positionName } from "@realms/contracts";

export function BoardPositionLabel({ slot }: { slot: number }) {
  useLanguage();
  return <span className="board-position-name">{msg(positionName(slot) ?? "")}</span>;
}
