import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/auth";

export const ProtectedRoute = ({ children }: { children?: ReactNode } = {}) => {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  if (!token || role !== "ADMIN") return <Navigate to="/login" replace />;
  return children ?? <Outlet />;
};
