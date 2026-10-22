import { X } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";

import { useMatch } from "../../MatchContext";

export function ErrorToast() {
  const { error, setError } = useMatch();
  return (
    <>
      {error && (
        <div className="toast" role="alert">
          {msg(error)}
          <button aria-label={msg("Dismiss error")} onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
