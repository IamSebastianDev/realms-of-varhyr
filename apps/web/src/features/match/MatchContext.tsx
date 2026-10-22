import { createContext, useContext, type ReactNode } from "react";
import type { MatchController } from "./hooks/controller/useMatchController";

const MatchContext = createContext<MatchController | null>(null);

export function MatchProvider({
  value,
  children,
}: {
  value: MatchController;
  children: ReactNode;
}) {
  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

/** The running match: its state, derived view and every action the screen can take. */
export function useMatch(): MatchController {
  const ctl = useContext(MatchContext);
  if (!ctl) throw new Error("useMatch must be used inside a MatchProvider.");
  return ctl;
}
