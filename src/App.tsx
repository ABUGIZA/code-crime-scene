import { useStore } from "./lib/store";
import { Sidebar } from "./components/Sidebar";
import { Toast } from "./components/Toast";
import { Onboarding } from "./views/Onboarding";
import { Home } from "./views/Home";
import { Analyzing } from "./views/Analyzing";
import { Report } from "./views/Report";
import { Cases } from "./views/Cases";
import { Settings } from "./views/Settings";
import { Fingerprint } from "./components/Icons";

function Splash() {
  return (
    <div className="center-stage">
      <div style={{ color: "var(--ink-faint)" }}>
        <Fingerprint size={40} />
      </div>
    </div>
  );
}

export default function App() {
  const { ready, route } = useStore();

  if (!ready) return <Splash />;

  if (route === "onboarding") {
    return (
      <>
        <Onboarding />
        <Toast />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        {route === "home" && <Home />}
        {route === "analyzing" && <Analyzing />}
        {route === "report" && <Report />}
        {route === "cases" && <Cases />}
        {route === "settings" && <Settings />}
      </main>
      <Toast />
    </div>
  );
}
