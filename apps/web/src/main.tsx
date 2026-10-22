import "@realms/ui/fonts";
import "./app/styles/styles.css";
import "./app/styles/card-layout.css";
import "./app/styles/layout.css";
import { ApplicationPreferences } from "@realms/ui/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import { AudioProvider } from "./app/providers/AudioProvider";
import "./features/audio/audio.css";
import { App } from "./app/App";
import "./app/styles/detail-chrome.css";
import "./features/match/styles/arena.css";
import "./features/decks/styles/deck-builder.css";
import "./features/collection/styles/collection.css";
import "./features/multiplayer/styles/multiplayer.css";
import "./features/lobby/styles/start-screen.css";
import "./features/tutorial/tutorial.css";
import "./features/match/styles/combat-fx.css";
import "./features/match/styles/match-summary.css";
import "./features/profile/styles/profile.css";
import "./features/collection/styles/collection-stats.css";
import "./app/styles/form-controls.css";
import "./features/onboarding/styles/onboarding.css";
import "./app/styles/touch.css";
import "./app/styles/plate.css";
import "./app/styles/scene-transition.css";
import "./features/match/styles/hand-fan.css";
import "./lib/select-picker";
import "./app/styles/ui-scale.css";
import { watchUiScale } from "./lib/uiScale";
import { RotateNotice } from "./components/RotateNotice";
import { LoadingScreen } from "./components/LoadingScreen";
import { installTouchDrag } from "./lib/touchDrag";
import "./app/styles/loading.css";
watchUiScale();
installTouchDrag();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ApplicationPreferences>
      <AudioProvider>
        <App />
      </AudioProvider>
      <RotateNotice />
      <LoadingScreen />
    </ApplicationPreferences>
  </React.StrictMode>,
);
