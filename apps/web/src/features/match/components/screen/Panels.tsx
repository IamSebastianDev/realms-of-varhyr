import {
  DebugPanel,
  DiscardPanel,
  JournalPanel,
  MatchMenuDialog,
  RulesContent,
  SidePanel,
} from "../MatchPanels";
import { PreferenceControls, VersionLine } from "../../../settings/components/SettingsPage";

import { useMatch } from "../../MatchContext";

export function Panels() {
  const {
    concede,
    confirmConcede,
    connection,
    exportReplay,
    fullscreen,
    historyIndex,
    historyLength,
    historySteps,
    initial,
    local,
    logOpen,
    match,
    navigate,
    online,
    panel,
    setConfirmConcede,
    setHistoryIndex,
    setLogOpen,
    setPanel,
    setSelected,
    skipEmptyWindows,
    state,
    tutorial,
    view,
    viewer,
    watching,
  } = useMatch();
  return (
    <>
      {panel === "menu" && (
        <MatchMenuDialog
          match={match}
          online={online}
          local={local}
          watching={watching}
          tutorial={!!tutorial}
          finished={!!state.outcome}
          connection={connection}
          fullscreen={fullscreen}
          logOpen={logOpen}
          skipEmptyWindows={skipEmptyWindows}
          confirmConcede={confirmConcede}
          setConfirmConcede={setConfirmConcede}
          concede={concede}
          setPanel={setPanel}
          setLogOpen={setLogOpen}
          goSettings={() => navigate("settings")}
          goMenu={() => navigate("menu")}
        />
      )}
      {panel && panel !== "menu" && (
        <SidePanel panel={panel} close={() => setPanel(null)}>
          {panel === "rules" && <RulesContent />}
          {panel === "settings" && (
            <div className="settings-content match-preferences">
              <PreferenceControls />
              <VersionLine />
            </div>
          )}
          {panel === "discard" && <DiscardPanel view={view} viewer={viewer} />}
          {panel === "journal" && <JournalPanel view={view} />}
          {panel === "debug" && (
            <DebugPanel
              view={view}
              initial={initial}
              historyLength={historyLength}
              historyIndex={historyIndex}
              historySteps={historySteps}
              local={local}
              setHistoryIndex={setHistoryIndex}
              setSelected={setSelected}
              exportReplay={exportReplay}
            />
          )}
        </SidePanel>
      )}
    </>
  );
}
