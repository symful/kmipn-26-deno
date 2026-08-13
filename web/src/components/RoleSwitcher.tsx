import { useAuthStore } from "../stores/auth";
import type { Role } from "../types";

export const RoleSwitcher = () => {
  const { user, activeRole, setActiveRole } = useAuthStore();

  if (!user) return null;

  const roles: Role[] = [user.role];

  if (roles.length <= 1) return null;

  return (
    <select
      value={activeRole ?? user.role}
      onChange={(e) => setActiveRole(e.target.value as Role)}
      className="role-switcher"
    >
      {roles.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>
  );
};
