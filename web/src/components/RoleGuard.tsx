import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import type { Role } from "../types";

interface RoleGuardProps {
  children: ReactNode;
  roles: Role[];
}

export const RoleGuard = ({ children, roles }: RoleGuardProps) => {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
};
