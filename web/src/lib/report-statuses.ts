import type { ReportStatus } from "../types";

/**
 * Statuses from which a WARGA (reporter) may self-close their own report.
 * Must mirror SELF_CLOSABLE_STATES in the backend (src/types/case-states.ts).
 */
export const WARGA_SELF_CLOSABLE_STATUSES = [
  "verified",
  "assigned",
  "in_progress",
  "needs_survey",
  "needs_completion",
] as const;

/**
 * All valid report statuses in the system.
 * These are the canonical status values used throughout the application.
 */
export const REPORT_STATUSES = [
  "submitted",
  "under_review",
  "verified",
  "assigned",
  "in_progress",
  "needs_survey",
  "resolved",
  "rejected",
  "duplicate_merged",
  "needs_completion",
  "out_of_scope",
  "pending",
  "draft",
] as const;

export type ReportStatusValue = (typeof REPORT_STATUSES)[number];

/**
 * Status options for admin UI dropdowns (with "Semua Status" option).
 * Used in Queue.tsx and other admin filters.
 */
export const STATUS_OPTIONS: { value: ReportStatus | ""; label: string }[] = [
  { value: "" as ReportStatus | "", label: "Semua Status" },
  { value: "submitted" as ReportStatus, label: "Submitted" },
  { value: "under_review" as ReportStatus, label: "Under Review" },
  { value: "verified" as ReportStatus, label: "Verified" },
  { value: "assigned" as ReportStatus, label: "Assigned" },
  { value: "in_progress" as ReportStatus, label: "In Progress" },
  { value: "needs_survey" as ReportStatus, label: "Needs Survey" },
];

/**
 * Status options for admin UI with Indonesian labels.
 * Used in Ekspor.tsx and other admin export filters.
 */
export const STATUS_OPTIONS_ID: { value: ReportStatus | ""; label: string }[] =
  [
    { value: "" as ReportStatus | "", label: "Semua Status" },
    { value: "submitted" as ReportStatus, label: "Perlu Tindakan" },
    { value: "under_review" as ReportStatus, label: "Sedang Ditinjau" },
    { value: "verified" as ReportStatus, label: "Terverifikasi" },
    { value: "in_progress" as ReportStatus, label: "Sedang Dikerjakan" },
    { value: "resolved" as ReportStatus, label: "Selesai" },
    { value: "rejected" as ReportStatus, label: "Ditolak" },
  ];

/**
 * Status options for public portal UI with colors.
 * Used in PublicCaseList.tsx.
 */
export const PUBLIC_STATUS_OPTIONS: {
  value: ReportStatus;
  label: string;
  color: string;
}[] = [
  {
    value: "submitted" as ReportStatus,
    label: "Menunggu verifikasi",
    color: "bg-yellow-100 text-yellow-700",
  },
  {
    value: "assigned",
    label: "Menunggu Penugasan",
    color: "bg-blue-100 text-blue-700",
  },
  {
    value: "verified" as ReportStatus,
    label: "Terverifikasi",
    color: "bg-blue-100 text-blue-700",
  },
  {
    value: "in_progress" as ReportStatus,
    label: "Sedang Ditangani",
    color: "bg-blue-100 text-blue-700",
  },
  {
    value: "needs_survey" as ReportStatus,
    label: "Perlu Survei Cepat",
    color: "bg-yellow-100 text-yellow-700",
  },
  {
    value: "needs_completion" as ReportStatus,
    label: "Perlu Kelengkapan",
    color: "bg-yellow-100 text-yellow-700",
  },
  {
    value: "resolved" as ReportStatus,
    label: "Selesai",
    color: "bg-teal-50 text-teal-700",
  },
  {
    value: "rejected" as ReportStatus,
    label: "Ditolak",
    color: "bg-red-100 text-red-700",
  },
];

/**
 * All statuses for filter component (StatusFilter.tsx).
 * Includes all workflow statuses with Indonesian labels.
 */
export const ALL_STATUSES: { value: ReportStatus | ""; label: string }[] = [
  { value: "" as ReportStatus | "", label: "Semua" },
  { value: "submitted" as ReportStatus, label: "Menunggu verifikasi" },
  { value: "assigned", label: "Menunggu Penugasan" },
  { value: "verified" as ReportStatus, label: "Terverifikasi" },
  { value: "in_progress" as ReportStatus, label: "Sedang Ditangani" },
  { value: "resolved" as ReportStatus, label: "Selesai" },
  { value: "rejected" as ReportStatus, label: "Ditolak" },
  { value: "needs_survey" as ReportStatus, label: "Perlu Survei Cepat" },
  { value: "needs_completion" as ReportStatus, label: "Perlu Kelengkapan" },
];
