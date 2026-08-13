import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
};
