import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/Toast";
import { PublicHome } from "./pages/public/Home";
import { PublicCaseDetail } from "./pages/public/CaseDetail";
import { Methodology } from "./pages/public/Methodology";
import { PublicCaseList } from "./pages/public/CaseList";
import { PublicStatistics } from "./pages/public/Statistics";
import { SubmitReport } from "./pages/public/SubmitReport";
import { AdminLogin } from "./pages/admin/Login";
import { AdminDashboard } from "./pages/admin/Dashboard";
import { AdminCaseList } from "./pages/admin/CaseList";
import { AdminCaseDetail } from "./pages/admin/CaseDetail";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RoleGuard } from "./components/RoleGuard";
import { AdminLayout } from "./components/AdminLayout";
import Queue from "./pages/verifikator/Queue";
import CaseReview from "./pages/verifikator/CaseReview";
import TaskList from "./pages/surveyor/TaskList";
import TaskDetail from "./pages/surveyor/TaskDetail";
import VerifyReport from "./pages/verify/VerifyReport";
import TokenVerify from "./pages/verify/TokenVerify";
import VerifyTraining from "./pages/verify/Training";
import { WargaCreateReport } from "./pages/warga/CreateReport";
import { OperatorDashboard } from "./pages/operator/Dashboard";
import { OperatorAIConsole } from "./pages/operator/AIConsole";
import { OperatorCaseDetail } from "./pages/operator/CaseDetail";
import { PetugasTasks } from "./pages/petugas/Tasks";
import { ExecDashboard } from "./pages/exec/Dashboard";
import { AdminUsers } from "./pages/admin/Users";
import { AdminCategories } from "./pages/admin/Categories";
import { AdminWilayah } from "./pages/admin/Wilayah";
import { AdminAudit } from "./pages/admin/Audit";
import { AdminPriorityConfig } from "./pages/admin/PriorityConfig";
import { AdminOutbox } from "./pages/admin/Outbox";
import { AdminAIConsole } from "./pages/admin/AIConsole";
import { AdminDaerahDashboard } from "./pages/admin-daerah/Dashboard";
import { AdminDaerahUnits } from "./pages/admin-daerah/Units";
import { AdminDaerahSla } from "./pages/admin-daerah/Sla";
import { AdminDaerahCaseList } from "./pages/admin-daerah/CaseList";
import { AuditorDashboard } from "./pages/auditor/Dashboard";
import { AuditLog } from "./pages/auditor/AuditLog";
import { RtRwTraining } from "./pages/rt-rw/Training";
import { NotificationList } from "./pages/notifications/NotificationList";
import { Settings } from "./pages/settings/Settings";

export const App = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastContainer />
        <Routes>
        <Route path="/" element={<PublicHome />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="/case/:id" element={<PublicCaseDetail />} />
          <Route path="/peta" element={<PublicCaseList />} />
          <Route path="/statistics" element={<PublicStatistics />} />
          <Route path="/public/submit" element={<SubmitReport />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="cases" element={<AdminCaseList />} />
            <Route path="cases/:id" element={<AdminCaseDetail />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="wilayah" element={<AdminWilayah />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="priority" element={<AdminPriorityConfig />} />
            <Route path="outbox" element={<AdminOutbox />} />
            <Route path="settings" element={<Settings />} />
            <Route path="ai-console" element={<AdminAIConsole />} />
            <Route path="notifications" element={<NotificationList />} />
            <Route
              path="executive"
              element={
                <RoleGuard roles={["PENGAMBIL_KEPUTUSAN", "ADMIN"]}>
                  <ExecDashboard />
                </RoleGuard>
              }
            />
          </Route>
          <Route
            path="/verifikator/queue"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["VERIFIKATOR", "ADMIN"]}>
                  <Queue />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/verifikator/cases/:id"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["VERIFIKATOR", "ADMIN"]}>
                  <CaseReview />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route path="/verify/public" element={<TokenVerify />} />
          <Route
            path="/verify"
            element={
              <RoleGuard roles={["RT_RW", "ADMIN"]}>
                <VerifyReport />
              </RoleGuard>
            }
          />
          <Route
            path="/verify/training"
            element={
              <RoleGuard roles={["RT_RW", "ADMIN"]}>
                <VerifyTraining />
              </RoleGuard>
            }
          />
          <Route
            path="/rt-rw/training"
            element={
              <RoleGuard roles={["RT_RW", "ADMIN"]}>
                <RtRwTraining />
              </RoleGuard>
            }
          />
          <Route
            path="/surveyor/tasks"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["SURVEYOR", "ADMIN"]}>
                  <TaskList />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/surveyor/tasks/:id"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["SURVEYOR", "ADMIN"]}>
                  <TaskDetail />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route path="/warga/new" element={<WargaCreateReport />} />
          <Route
            path="/operator"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["OPERATOR", "ADMIN"]}>
                  <OperatorDashboard />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/operator/cases/:id"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["OPERATOR", "ADMIN"]}>
                  <OperatorCaseDetail />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/operator/ai-console"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["OPERATOR", "ADMIN"]}>
                  <OperatorAIConsole />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/petugas/tasks"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["PETUGAS", "ADMIN"]}>
                  <PetugasTasks />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-daerah"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["ADMIN_DAERAH", "ADMIN"]}>
                  <AdminLayout />
                </RoleGuard>
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDaerahDashboard />} />
            <Route
              path="cases"
              element={
                <RoleGuard roles={["ADMIN_DAERAH", "ADMIN"]}>
                  <AdminDaerahCaseList />
                </RoleGuard>
              }
            />
            <Route
              path="wilayah"
              element={
                <RoleGuard roles={["ADMIN_DAERAH", "ADMIN"]}>
                  <AdminWilayah />
                </RoleGuard>
              }
            />
            <Route
              path="categories"
              element={
                <RoleGuard roles={["ADMIN_DAERAH", "ADMIN"]}>
                  <AdminCategories />
                </RoleGuard>
              }
            />
            <Route
              path="units"
              element={
                <RoleGuard roles={["ADMIN_DAERAH", "ADMIN"]}>
                  <AdminDaerahUnits />
                </RoleGuard>
              }
            />
            <Route
              path="sla"
              element={
                <RoleGuard roles={["ADMIN_DAERAH", "ADMIN"]}>
                  <AdminDaerahSla />
                </RoleGuard>
              }
            />
            <Route
              path="priority"
              element={
                <RoleGuard roles={["ADMIN_DAERAH", "ADMIN"]}>
                  <AdminPriorityConfig />
                </RoleGuard>
              }
            />
            <Route
              path="accounts"
              element={
                <RoleGuard roles={["ADMIN_DAERAH", "ADMIN"]}>
                  <AdminUsers />
                </RoleGuard>
              }
            />
            <Route
              path="integrasi"
              element={
                <RoleGuard roles={["ADMIN_DAERAH", "ADMIN"]}>
                  <AdminOutbox />
                </RoleGuard>
              }
            />
          </Route>
          <Route
            path="/auditor"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["AUDITOR", "ADMIN"]}>
                  <AuditLog />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/auditor/audit-log"
            element={
              <ProtectedRoute>
                <RoleGuard roles={["AUDITOR", "ADMIN"]}>
                  <AdminLayout />
                </RoleGuard>
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminAudit />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
};
