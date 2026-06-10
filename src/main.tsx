import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./lib/store";
import { I18nProvider } from "./lib/i18n";
import "./index.css";
import "./styles/app1.css";
import "./styles/app2.css";
import "./styles/app3.css";
import "./styles/enhance1.css";
import "./styles/enhance2.css";
import "./styles/enhance3.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </I18nProvider>
  </React.StrictMode>,
);
