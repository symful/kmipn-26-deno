import { PublicLayout } from "./components/design-system/PublicLayout";
import { PublicHome } from "./pages/PublicHome";
import { PublicCaseDetail } from "./pages/PublicCaseDetail";
import { PublicCaseList } from "./pages/PublicCaseList";
import { PublicRingkasan } from "./pages/PublicRingkasan";
import { PublicStatistics } from "./pages/PublicStatistics";
import { Methodology } from "./pages/Methodology";
import { PublicLeaderboard } from "./pages/PublicLeaderboard";
import { SubmitReport } from "./pages/SubmitReport";
import { CreateReport } from "./pages/CreateReport";
import { NotFound } from "./pages/NotFound";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/Toast";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Dashboard } from "./pages/Dashboard";
import { CaseList } from "./pages/CaseList";
import { CaseDetail } from "./pages/CaseDetail";
import { Users } from "./pages/Users";
import { Categories } from "./pages/Categories";
import { Audit } from "./pages/Audit";
import { PriorityConfig } from "./pages/PriorityConfig";
import { AIConsole } from "./pages/AIConsole";
import Queue from "./pages/Queue";
import { Export } from "./pages/Ekspor";

import Tasks from "./pages/Tasks";
import CaseReview from "./pages/CaseReview";
import { NotificationList } from "./pages/NotificationList";
import { Settings } from "./pages/Settings";
import { Units } from "./pages/Units";
import { RegionalDashboard } from "./pages/RegionalDashboard";
import { Analytics } from "./pages/Analytics";
import { WargaReportDetail } from "./pages/WargaReportDetail";

const SystemIndexRedirect = () => <Navigate to="/system/dashboard" replace />;

export const App = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastContainer />
        <Routes>
          <Route
            element={
              <PublicLayout>
                <Outlet />
              </PublicLayout>
            }
          >
            <Route path="/" element={<PublicHome />} />
            <Route path="/ringkasan" element={<PublicRingkasan />} />
            <Route path="/statistik" element={<PublicStatistics />} />
            <Route path="/statistics" element={<PublicStatistics />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/metodologi" element={<Methodology />} />
            <Route path="/leaderboard" element={<PublicLeaderboard />} />
            <Route path="/peta" element={<PublicHome />} />
            <Route path="/cases" element={<PublicHome />} />
            <Route path="/case/:id" element={<PublicCaseDetail />} />
            <Route path="/public/cases" element={<PublicCaseList />} />
            <Route path="/public/cases/:id" element={<PublicCaseDetail />} />
            <Route path="/submit" element={<SubmitReport />} />
          </Route>
          <Route path="/new" element={<CreateReport />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/laporan/:id"
            element={
              <ProtectedRoute roles={["WARGA"]}>
                <WargaReportDetail />
              </ProtectedRoute>
            }
          />

          <Route
            path="/system"
            element={
              <ProtectedRoute>
                <Layout>
                  <Outlet />
                </Layout>
              </ProtectedRoute>
            }
          >
            <Route index element={<SystemIndexRedirect />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="cases" element={<CaseList />} />
            <Route path="cases/:id" element={<CaseDetail />} />
            <Route path="case-review/:id" element={<CaseReview />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="users" element={<Users />} />
            <Route path="categories" element={<Categories />} />
            <Route path="audit" element={<Audit />} />
            <Route path="priority" element={<PriorityConfig />} />
            <Route path="settings" element={<Settings />} />
            <Route path="ai-console" element={<AIConsole />} />
            <Route path="queue" element={<Queue />} />
            <Route path="export" element={<Export />} />
            <Route path="units" element={<Units />} />
            <Route path="regional" element={<RegionalDashboard />} />
            <Route path="analitik" element={<Analytics />} />
            <Route path="notifications" element={<NotificationList />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
};
