import { z } from "zod";

// Re-export all canonical types from lib/types.ts
export * as T from "./types";

// Re-export canonical string-union types for use in Zod schemas
export type {
  Role,
  ReportStatus,
  PriorityBucket,
  SeverityLevel,
  CaseDecision,
  PetugasStatus,
} from "./types";

// dbId accepts any non-empty identifier string used across the system.
// The system uses UUID format for all primary keys (reports, tasks, generateId).
// We validate at the application level (database foreign keys, unique constraints)
// rather than restricting by format at the schema level.
export const dbId = z.string().trim().min(1).max(40);

export const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(128),
});

export const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

export const RegisterWargaSchema = z.object({
  email: z.string().email().max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  name: z.string().min(1).max(255),
});

export const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

// Uploads may use the worker's same-origin R2 route in local development.
export const PhotoUrlSchema = z.string().refine((value) => {
  if (/^\/r2\/reports\/[A-Za-z0-9_./%-]+$/.test(value) && !value.includes(".."))
    return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}, "Expected an HTTP(S) photo URL or /r2/reports/ upload path");

export const ReportCreateSchema = z.object({
  address_area: z.string().trim().max(1000).optional(),
  idempotency_key: z.string(),
  category_id: dbId,
  description: z.string().min(1).max(2000),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  device_id: z.string().optional(),
  local_id: z.string().optional(),
  photo_urls: z.array(PhotoUrlSchema).max(10).optional(),
  reported_at: z.string().datetime({ offset: true }).optional(),
  title: z.string().max(255).optional(),
  population_affected: z.number().int().min(0).optional(),
  vulnerability_index: z.number().min(0).max(1).optional(),
  impact_dampak: z.array(z.string()).optional(),
  reported_severity: z.enum(["ringan", "sedang", "berat", "kritis"]).optional(),
  supporting_case_id: dbId.optional(),
  consent: z.boolean().optional(),
  kecamatan: z.string().max(255).optional(),
  kelurahan: z.string().max(255).optional(),
  kabupaten: z.string().max(255).optional(),
  provinsi: z.string().max(255).optional(),
});

export const PublicReportCreateSchema = z.object({
  address_area: z.string().trim().max(1000).optional(),
  idempotency_key: z.string(),
  category_id: dbId,
  description: z.string().min(10).max(500),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  device_id: z.string(),
  photo_urls: z.array(PhotoUrlSchema).max(10).optional(),
  reported_at: z.string().datetime().optional(),
  title: z.string().max(255).optional(),
  population_affected: z.number().int().min(0).optional(),
  vulnerability_index: z.number().min(0).max(1).optional(),
  reported_severity: z.enum(["ringan", "sedang", "berat", "kritis"]).optional(),
  supporting_case_id: dbId.optional(),
  impact_dampak: z.array(z.string()).optional(),
  consent: z.boolean().optional(),
  kecamatan: z.string().max(255).optional(),
  kelurahan: z.string().max(255).optional(),
  kabupaten: z.string().max(255).optional(),
  provinsi: z.string().max(255).optional(),
});

export const ReportUpdateSchema = z.object({
  address_area: z.string().trim().min(1).max(1000).optional(),
  status: z
    .enum([
      "draft",
      "submitted",
      "under_review",
      "verified",
      "assigned",
      "in_progress",
      "resolved",
      "closed",
      "rejected",
      "duplicate_merged",
      "needs_survey",
      "needs_completion",
    ])
    .optional(),
  reason: z.string().max(1000).optional(),
  description: z.string().min(1).max(2000).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  assigned_to: dbId.nullable().optional(),
});

export const PhotoUploadRequestSchema = z.object({
  content_type: z.enum(["image/jpeg", "image/png"]),
  idempotency_key: z.string().optional(),
  file: z.string().min(1).optional(),
});

export const PhotoBatchUploadRequestSchema = z.object({
  photos: z
    .array(z.enum(["image/jpeg", "image/png"]))
    .min(1)
    .max(20),
});

export const SyncBatchSchema = z.object({
  // Individual failures are returned with their index so valid queued reports
  // can still sync; the route validates each entry with ReportCreateSchema.
  reports: z.array(z.unknown()).min(1).max(50),
});

export const AgentAssessRequestSchema = z.object({
  report_id: dbId,
  idempotency_key: z.string().max(255).optional(),
});

export const AgentApproveSchema = z.object({
  report_id: dbId,
  reason: z.string().min(1, "reason is required").max(1000),
});

export const AgentMergeSchema = z.object({
  target_report_id: dbId,
  source_report_id: dbId,
  reason: z.string().min(1, "reason is required").max(1000),
});

export const AgentRejectSchema = z.object({
  report_id: dbId,
  reason: z.string().min(1, "reason is required").max(1000),
});

export const AgentRequestPhotoSchema = z.object({
  report_id: dbId,
  reason: z.string().min(1, "reason is required").max(1000),
});

export const VerifikatorCombineSchema = z.object({
  target_case_id: dbId,
  reason: z.string().optional(),
});

export const VerifikatorSeparateSchema = z.object({
  new_case_description: z
    .string()
    .min(10, "new_case_description must be at least 10 characters"),
  reason: z.string().optional(),
});

export const VerifikatorRejectSchema = z.object({
  reason: z.string().min(10, "reason must be at least 10 chars"),
});

export const CaseDecisionSchema = z.object({
  decision: z.enum([
    "valid",
    "needs_completion",
    "needs_survey",
    "duplicate",
    "out_of_scope",
    "rejected",
    "needs_clarification",
  ]),
  reason: z.string().min(1, "reason is required"),
  duplicate_of_report_id: dbId.optional(),
  surveyor_id: z.string().min(1).nullable().optional(),
  assigned_unit_id: z.string().min(1).nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
  severity: z.number().int().min(0).max(100).optional(),
  task_type: z.enum(["survei_verifikasi", "perbaikan_fisik"]).optional(),
});

export const VerifikatorReviewSanggahanSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  reason: z.string().min(1, "reason is required"),
});

export const VerifikatorVerifyCompletionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().min(1, "reason is required"),
  completion_notes: z.string().optional(),
});

export const PhotoUploadReportIdSchema = z.object({
  report_id: dbId,
});

export const SurveyorRejectSchema = z.object({
  reason: z.string().min(10, "reason must be at least 10 characters").max(1000),
});

export const PetugasRejectSchema = z.object({
  reason: z.string().min(10, "reason must be at least 10 characters").max(1000),
});

export const ClarificationSchema = z.object({
  message: z.string().min(5, "message must be at least 5 characters").max(1000),
});

export const VerifikatorAcceptSchema = z.object({
  reason: z.string().optional(),
  assigned_unit_id: z.string().optional(),
  deadline: z
    .string()
    .datetime()
    .optional()
    .refine((v) => (v ? new Date(v) > new Date() : true), {
      message: "deadline must be a future date",
    }),
  priority: z.number().int().min(0).max(100).optional(),
});

export const ProgressSchema = z.object({
  progress_percent: z.number().int().min(0).max(100),
  notes: z.string().max(2000).optional(),
  estimated_completion: z.string().datetime().optional(),
});

export const EvidenceSchema = z.object({
  description: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

export const CompleteSchema = z.object({
  summary: z.string().min(5, "summary must be at least 5 characters"),
});

export const PetugasStatusEnum = z.enum([
  "assigned",
  "in_progress",
  "pending_clarification",
  "completed",
]);

export const PetugasProgressSchema = z.object({
  status: PetugasStatusEnum,
  notes: z.string().max(2000).optional(),
  completion_evidence_urls: z.array(z.string().url()).max(20).optional(),
});

export const PriorityWeightsSchema = z
  .object({
    surveyor_task_priority: z.number().min(0).max(1),
    report_age_days_priority: z.number().min(0).max(1),
    vulnerability_index_priority: z.number().min(0).max(1),
    population_affected_priority: z.number().min(0).max(1),
    distance_from_urban_center_priority: z.number().min(0).max(1),
  })
  .refine(
    (d) =>
      d.surveyor_task_priority +
        d.report_age_days_priority +
        d.vulnerability_index_priority +
        d.population_affected_priority +
        d.distance_from_urban_center_priority ===
      1,
    { message: "weights must sum to 1" },
  );

// Admin schemas
export const AdminEscalateSchema = z.object({
  reason: z.string().min(5, "reason must be at least 5 characters"),
});

export const AdminAssignSchema = z.object({
  unit_id: dbId,
  instructions: z.string().max(2000).optional(),
  deadline: z.string().datetime("deadline must be an ISO datetime").optional(),
});

export const AdminPrioritySchema = z.object({
  new_score: z
    .number()
    .int()
    .min(0)
    .max(100, "new_score must be between 0 and 100"),
  reason: z.string().max(1000).optional(),
  factor_breakdown: z.record(z.string(), z.unknown()).optional(),
});

export const AdminSlaSchema = z.object({
  new_deadline: z.string().datetime("new_deadline must be an ISO datetime"),
  reason: z.string().min(5, "reason must be at least 5 characters"),
});

export const AdminMergeSchema = z.object({
  target_case_ids: z.array(dbId).min(1, "at least one target case is required"),
  reason: z.string().max(1000).optional(),
});

export const AdminSeparateSchema = z.object({
  report_ids_to_separate: z
    .array(dbId)
    .min(1, "at least one report id is required"),
  reason: z.string().max(1000).optional(),
  target_unit_id: dbId.optional(),
});

// Executive schemas
export const TrendPeriodSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"], {
    errorMap: () => ({
      message: "period must be one of: daily, weekly, monthly",
    }),
  }),
});

export type TrendPeriod = z.output<typeof TrendPeriodSchema>;

// =====================
// Admin-family schemas
// =====================

// MarkReadSchema: xor between id and mark_all â€” use superRefine to properly
// reject extra keys (z.object allows extra keys by default, so union+refine
// doesn't catch {id, mark_all} being accepted by branch 1 when branch 2 also matches)
export const MarkReadSchema = z
  .object({
    id: dbId.optional(),
    mark_all: z.literal(true).optional(),
  })
  .superRefine((data, ctx) => {
    const hasId = data.id !== undefined;
    const hasMarkAll = data.mark_all !== undefined;
    if (!hasId && !hasMarkAll) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of id or mark_all is required",
      });
    }
    if (hasId && hasMarkAll) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of id or mark_all is required",
      });
    }
  });

export type MarkRead = z.output<typeof MarkReadSchema>;

// Admin retry batch schema - ids as array of uuid
export const AdminRetryBatchSchema = z.object({
  ids: z.array(dbId).max(100),
});

export type AdminRetryBatch = z.output<typeof AdminRetryBatchSchema>;

// Auditor audit search query schema
export const AuditorAuditSearchQuerySchema = z.object({
  actor_id: z.string().optional(),
  action: z.string().optional(),
  object_type: z.string().optional(),
  object_id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type AuditorAuditSearchQuery = z.output<
  typeof AuditorAuditSearchQuerySchema
>;

// Auditor export query schema with format enum
export const AuditorExportQuerySchema = z.object({
  actor_id: z.string().optional(),
  action: z.string().optional(),
  object_type: z.string().optional(),
  object_id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(["csv", "json"]).default("csv"),
});

export type AuditorExportQuery = z.output<typeof AuditorExportQuerySchema>;

// System logs query schema
export const SystemLogsQuerySchema = z.object({
  level: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type SystemLogsQuery = z.output<typeof SystemLogsQuerySchema>;

export const AdminDaerahOperatorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
  is_active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type AdminDaerahOperatorsQuery = z.output<
  typeof AdminDaerahOperatorsQuerySchema
>;

// Admin-daerah petugas query schema
export const AdminDaerahPetugasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
  is_active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type AdminDaerahPetugasQuery = z.output<
  typeof AdminDaerahPetugasQuerySchema
>;

// Admin-daerah SLA query schema with filters
export const AdminDaerahSlaQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  kategori_id: dbId.optional(),
  prioritas: z.enum(["rendah", "sedang", "tinggi", "kritis"]).optional(),
  is_active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type AdminDaerahSlaQuery = z.output<typeof AdminDaerahSlaQuerySchema>;

// Admin-daerah cases query schema
export const AdminDaerahCasesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  category_id: dbId.optional(),
  search: z.string().max(255).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

export type AdminDaerahCasesQuery = z.output<
  typeof AdminDaerahCasesQuerySchema
>;

// Admin-daerah units query schema
export const AdminDaerahUnitsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  is_active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type AdminDaerahUnitsQuery = z.output<
  typeof AdminDaerahUnitsQuerySchema
>;

// Admin-daerah SLA schemas
export const CreateSlaRuleSchema = z.object({
  kategori_id: dbId,
  prioritas: z.enum(["rendah", "sedang", "tinggi", "kritis"], {
    errorMap: () => ({
      message: "prioritas must be one of: rendah, sedang, tinggi, kritis",
    }),
  }),
  jam: z.number().int().positive("jam must be a positive integer"),
  is_active: z.boolean().default(true),
});

export type CreateSlaRule = z.output<typeof CreateSlaRuleSchema>;

export const UpdateSlaRuleSchema = z.object({
  kategori_id: dbId.optional(),
  prioritas: z
    .enum(["rendah", "sedang", "tinggi", "kritis"], {
      errorMap: () => ({
        message: "prioritas must be one of: rendah, sedang, tinggi, kritis",
      }),
    })
    .optional(),
  jam: z.number().int().positive("jam must be a positive integer").optional(),
  is_active: z.boolean().optional(),
});

export type UpdateSlaRule = z.output<typeof UpdateSlaRuleSchema>;

// Admin-daerah units schemas
export const CreateUnitSchema = z
  .object({
    nama: z.string().min(1).max(255),
    name: z.string().min(1).max(255).optional(),
    alamat: z.string().max(1000).optional(),
    kontak: z.string().max(100).optional(),
    is_active: z.boolean().default(true),
  })
  .transform((data) => ({
    nama: data.nama ?? data.name ?? "",
    alamat: data.alamat,
    kontak: data.kontak,
    is_active: data.is_active,
  }));

export type CreateUnit = z.output<typeof CreateUnitSchema>;

export const UpdateUnitSchema = z.object({
  nama: z.string().min(2).max(255).optional(),
  alamat: z.string().max(1000).optional(),
  kontak: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateUnit = z.output<typeof UpdateUnitSchema>;

// Shared validated export filters.
const exportDateQuery = z.union([
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
      "Tanggal tidak valid.",
    ),
  z.string().datetime({ offset: true }),
]);
const exportFilterFields = {
  report_id: dbId.optional(),
  category_id: dbId.optional(),
  status: z
    .enum([
      "draft",
      "submitted",
      "under_review",
      "verified",
      "assigned",
      "in_progress",
      "resolved",
      "closed",
      "rejected",
      "merged",
      "separated",
      "duplicate_merged",
      "needs_survey",
      "needs_completion",
      "out_of_scope",
      "pending_clarification",
    ])
    .optional(),
  from: exportDateQuery.optional(),
  to: exportDateQuery.optional(),
};
const validExportRange = (v: {
  from?: string | undefined;
  to?: string | undefined;
}) =>
  !v.from ||
  !v.to ||
  Date.parse(v.from) <=
    Date.parse(v.to.length === 10 ? v.to + "T23:59:59.999Z" : v.to);
const rangeMessage = {
  message: "Tanggal akhir harus sama dengan atau setelah tanggal awal.",
  path: ["to"],
};
export const ExportCsvQuerySchema = z
  .object({ ...exportFilterFields, format: z.enum(["csv", "json"]).optional() })
  .refine(validExportRange, rangeMessage);
export type ExportCsvQuery = z.output<typeof ExportCsvQuerySchema>;
export const ExportGeoJsonQuerySchema = z
  .object({ ...exportFilterFields, format: z.literal("geojson").optional() })
  .refine(validExportRange, rangeMessage);
export type ExportGeoJsonQuery = z.output<typeof ExportGeoJsonQuerySchema>;
export const ExportPdfQuerySchema = z
  .object(exportFilterFields)
  .refine(validExportRange, rangeMessage);
export type ExportPdfQuery = z.output<typeof ExportPdfQuerySchema>;
export const ExportReportsQuerySchema = z
  .object({ ...exportFilterFields, format: z.enum(["csv", "geojson", "pdf"]) })
  .refine(validExportRange, rangeMessage);

// PriorityConfig schemas with refined weight sum validation
export const PriorityConfigWeightsSchema = z
  .object({
    severity: z.number().min(0).max(1),
    impact: z.number().min(0).max(1),
    vulnerability: z.number().min(0).max(1).optional(),
    report_count: z.number().min(0).max(1).optional(),
    sla: z.number().min(0).max(1),
  })
  .superRefine((d, ctx) => {
    const sum =
      d.severity +
      d.impact +
      (d.vulnerability ?? 0) +
      (d.report_count ?? 0) +
      d.sla;
    if (Math.abs(sum - 1.0) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Weights must sum to 1.0, got ${sum}`,
      });
    }
  });

export type PriorityConfigWeights = z.output<
  typeof PriorityConfigWeightsSchema
>;

export const CreatePriorityConfigSchema = z.object({
  weights: PriorityConfigWeightsSchema,
  reason: z.string().trim().min(1).max(1000).optional(),
});

export type CreatePriorityConfig = z.output<typeof CreatePriorityConfigSchema>;

export const UpdatePriorityConfigSchema = z.object({
  weights: PriorityConfigWeightsSchema,
});

export type UpdatePriorityConfig = z.output<typeof UpdatePriorityConfigSchema>;

// Reports query schemas
export const ReportsListQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  q: z.string().max(200).optional(),
  search: z.string().max(200).optional(),
  village: z.string().max(255).optional(),
  village_id: z.string().max(255).optional(),
  severity: z
    .enum([
      "ringan",
      "sedang",
      "berat",
      "kritis",
      "low",
      "medium",
      "high",
      "critical",
    ])
    .optional(),
  period: z.enum(["7d", "30d", "90d", "all"]).optional(),
  status: z.string().optional(),
  appeal: z.enum(["pending"]).optional(),
  category_id: dbId.optional(),
  creator_id: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ReportsListQuery = z.output<typeof ReportsListQuerySchema>;

export const ReportsNearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().default(1000),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ReportsNearbyQuery = z.output<typeof ReportsNearbyQuerySchema>;

export const ReportsDuplicatesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  category_id: dbId,
  radius: z.coerce.number().positive().default(500),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export type ReportsDuplicatesQuery = z.output<
  typeof ReportsDuplicatesQuerySchema
>;

export const ReportsHeatmapQuerySchema = z.object({
  status: z.string().optional(),
  category_id: dbId.optional(),
});

export type ReportsHeatmapQuery = z.output<typeof ReportsHeatmapQuerySchema>;

// Admin category schemas
export const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  icon: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  parent_id: dbId.nullable().optional(),
  code: z.string().max(10).optional(),
  short_code: z.string().max(5).optional(),
});

export type UpdateCategory = z.output<typeof updateCategorySchema>;

// ─── Admin user schemas (lowercase aliases used by admin routes) ──────────────

export const createUser = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  role: z.enum(["ADMIN", "PETUGAS", "WARGA"]),
});

export const updateUser = z.object({
  role: z.enum(["ADMIN", "PETUGAS", "WARGA"]),
});
