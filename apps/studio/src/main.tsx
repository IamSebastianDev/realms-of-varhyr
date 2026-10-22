import "@realms/ui/fonts";
import React from "react";
import ReactDOM from "react-dom/client";
import { ApplicationPreferences } from "@realms/ui";
import { App } from "./app/App";
import "./styles/studio.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ApplicationPreferences>
      <App />
    </ApplicationPreferences>
  </React.StrictMode>,
);
