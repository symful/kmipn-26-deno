import { statusColor, statusLabel } from "../theme/tokens";

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: color + "20", color }}
    >
      {statusLabel(status)}
    </span>
  );
};
