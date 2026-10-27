import { useMemo, type ReactNode } from "react";
import { CardStylesProvider as Provider } from "@realms/renderer/CardStyles";
import { useCollection } from "../../features/collection/stores/collectionStore";
import { selectedCardStyles } from "../../features/card-styles/lib/cardStyles";

export function CardStylesProvider({ children }: { children: ReactNode }) {
  const { collection } = useCollection();
  const styles = useMemo(() => selectedCardStyles(collection), [collection]);
  return <Provider styles={styles}>{children}</Provider>;
}
