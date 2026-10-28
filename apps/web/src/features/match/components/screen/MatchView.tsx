import { type CSSProperties } from "react";

import { TopBar } from "./TopBar";
import { ConnectionStrip } from "./ConnectionStrip";
import { HandZone } from "./HandZone";
import { ErrorToast } from "./ErrorToast";
import { ReplayBar } from "./ReplayBar";
import { PrivacyCover } from "./PrivacyCover";
import { MulliganDialog } from "./MulliganDialog";
import { RaisePicker } from "./RaisePicker";
import { ModePicker } from "./ModePicker";
import { DrawChoiceDialog } from "./DrawChoiceDialog";
import { HandDiscardDialog } from "./HandDiscardDialog";
import { LibraryPickDialog } from "./LibraryPickDialog";
import { RepriseDialog } from "./RepriseDialog";
import { ResponseEnergyDialog } from "./ResponseEnergyDialog";
import { SummaryLayer } from "./SummaryLayer";
import { CreatureActions } from "./CreatureActions";
import { DragGhost } from "./DragGhost";
import { CardPreview } from "./CardPreview";
import { TutorialCoach } from "./TutorialCoach";
import { FightEffects } from "./FightEffects";
import { Panels } from "./Panels";
import { MatchMain } from "./MatchMain";
import { useMatch } from "../../MatchContext";

export function MatchView() {
  const { arena, drag, reduced, transitioning, tutorial } = useMatch();
  return (
    <div
      className={`app ${drag ? "is-dragging" : ""} ${reduced ? "reduce-motion" : ""} ${tutorial ? "tutorial-on" : ""} ${transitioning ? "phase-transitioning" : ""}`}
      style={{ "--arena-image": `url("${arena.art}")` } as CSSProperties}
    >
      <div className="world-bg" />
      <div className="world-vignette" />
      <TopBar />
      <ConnectionStrip />
      <MatchMain />
      <HandZone />
      <ErrorToast />
      <ReplayBar />
      <PrivacyCover />
      <MulliganDialog />
      <RaisePicker />
      <ModePicker />
      <DrawChoiceDialog />
      <HandDiscardDialog />
      <LibraryPickDialog />
      <RepriseDialog />
      <ResponseEnergyDialog />
      <SummaryLayer />
      <CreatureActions />
      <DragGhost />
      <CardPreview />
      <TutorialCoach />
      <FightEffects />
      <Panels />
    </div>
  );
}
