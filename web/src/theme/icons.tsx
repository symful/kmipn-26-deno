import React from "react";

// ─── AdminLayout Icons ─────────────────────────────────────────────────────────

export const GridIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 15 15"
    fill="none"
    className={className}
  >
    <rect
      x="1"
      y="1"
      width="5"
      height="5"
      rx="1"
      stroke="currentColor"
      strokeWidth="2"
    />
    <rect
      x="9"
      y="1"
      width="5"
      height="5"
      rx="1"
      stroke="currentColor"
      strokeWidth="2"
    />
    <rect
      x="1"
      y="9"
      width="5"
      height="5"
      rx="1"
      stroke="currentColor"
      strokeWidth="2"
    />
    <rect
      x="9"
      y="9"
      width="5"
      height="5"
      rx="1"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);

export const MapIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <path
      d="M7 1L13 4V10L7 13L1 10V4L7 1Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export const UsersIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <circle cx="7" cy="4" r="3" stroke="currentColor" strokeWidth="2" />
    <path
      d="M1 13C1 10 3.5 8 7 8C10.5 8 13 10 13 13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const CategoriesIcon: React.FC<{
  className?: string;
  size?: number;
}> = ({ className, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <rect
      x="1"
      y="1"
      width="5"
      height="5"
      rx="1"
      stroke="currentColor"
      strokeWidth="2"
    />
    <circle cx="11.5" cy="3.5" r="2.5" stroke="currentColor" strokeWidth="2" />
    <polygon points="3.5,9 6,13 1,13" stroke="currentColor" strokeWidth="2" />
    <rect
      x="9"
      y="9"
      width="4"
      height="4"
      rx="1"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);

export const WilayahIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="2" />
    <path
      d="M7 1V3M7 9V13M1 7H3M11 7H13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const PriorityIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <path
      d="M1 13V7M5 13V4M9 13V9M13 13V1"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const AIIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <path
      d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export const AuditIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <rect
      x="1"
      y="3"
      width="12"
      height="10"
      rx="1"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M4 1V3M10 1V3M1 6H13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const SettingsIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="2" />
    <path
      d="M7 1V3M7 11V13M1 7H3M11 7H13M2.93 2.93L4.34 4.34M9.66 9.66L11.07 11.07M2.93 11.07L4.34 9.66M9.66 4.34L11.07 2.93"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const SearchIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="2" />
    <path
      d="M9 9L12 12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const LogoutIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <path
      d="M5 2H2V12H5M9 4L12 7L9 10M12 7H5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ─── Dashboard Icons ───────────────────────────────────────────────────────────

export const QueueIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <rect
      x="1"
      y="1"
      width="12"
      height="12"
      rx="2"
      stroke="currentColor"
      strokeWidth="2"
      strokeDasharray="3 2"
    />
  </svg>
);

export const TasksIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <rect
      x="1"
      y="1"
      width="12"
      height="12"
      rx="2"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);

export const ChartIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <path
      d="M1 13V7M5 13V4M9 13V9M13 13V1"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const ExportIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <path
      d="M7 1V9M4 6L7 9L10 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2 10V12H12V10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ─── Settings Icons ───────────────────────────────────────────────────────────

export const PencilIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
    />
  </svg>
);

export const PlusIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4v16m8-8H4"
    />
  </svg>
);

export const XIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);

export const UserIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <circle cx="7" cy="4" r="3" stroke="currentColor" strokeWidth="2" />
    <path
      d="M1 13c0-3 2.5-5 6-5s6 2 6 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const BuildingIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <rect
      x="1"
      y="4"
      width="12"
      height="9"
      rx="1"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M4 4V2M10 4V2M1 7h12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const CategoryIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    className={className}
  >
    <path
      d="M1 2h4l1 4H2a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1H9L8 1H2a1 1 0 00-1 1z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

// ─── Users Icons ──────────────────────────────────────────────────────────────

export const TrashIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

export const UserPlusIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
    />
  </svg>
);

// ─── Notification Icons ───────────────────────────────────────────────────────

export const BellIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
  </svg>
);

export const CheckIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 20,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
      clipRule="evenodd"
    />
  </svg>
);
