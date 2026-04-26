import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import PublicMode from "./pages/PublicMode";
import BusinessMode from "./pages/BusinessMode";
import EcoMode from "./pages/EcoMode";
import FuturesPage from "./pages/FuturesPage";
import StatsMode from "./pages/StatsMode";
import AIReportsHub from "./pages/AIReportsHub";
import ErrorBoundary from "./components/shell/ErrorBoundary";

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<PublicMode />} />
          <Route path="/business" element={<BusinessMode />} />
          <Route path="/eco" element={<EcoMode />} />
          <Route path="/futures" element={<FuturesPage />} />
          <Route path="/stats" element={<StatsMode />} />
          <Route path="/ai" element={<AIReportsHub />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
