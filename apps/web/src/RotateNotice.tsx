import { Smartphone } from "lucide-react";
import { t as msg, useLanguage } from "@realms/ui/i18n";

/** Shown instead of the app on a phone held upright (the page is only laid out for landscape). Hidden by CSS otherwise. */
export function RotateNotice() {
  useLanguage();
  return (
    <div className="rotate-notice" role="alert">
      <Smartphone aria-hidden />
      <h1>{msg("Turn your phone sideways")}</h1>
      <p>{msg("Realms of Varhyr is played in landscape.")}</p>
    </div>
  );
}
