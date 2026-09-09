import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import type { Role } from "../types";

export const ProtectedRoute = ({
  children,
  roles,
}: {
  children?: ReactNode;
  roles?: Role[];
} = {}) => {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  const allowed = roles ?? ["ADMIN"];
  if (!token || !role || !allowed.includes(role))
    return <Navigate to="/login" replace />;
  return children ?? <Outlet />;
};
