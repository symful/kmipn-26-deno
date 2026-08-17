import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  wilayah_id: z.string().uuid().nullable().optional(),
});

export const RegisterVerifikatorSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  wilayah_id: z.string().uuid().nullable().optional(),
});

export const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export const ReportCreateSchema = z.object({
  idempotency_key: z.string().uuid(),
  category_id: z.string().uuid(),
  description: z.string().min(1).max(2000),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  device_id: z.string().uuid().optional(),
  photo_urls: z.array(z.string().url()).max(10).optional(),
  reported_at: z.string().datetime().optional(),
  title: z.string().max(255).optional(),
  population_affected: z.number().int().min(0).optional(),
  vulnerability_index: z.number().min(0).max(1).optional(),
  consent: z.boolean().optional(),
});

export const PublicReportCreateSchema = z.object({
  idempotency_key: z.string().uuid(),
  category_id: z.string().uuid(),
  description: z.string().min(10).max(500),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  device_id: z.string().uuid(),
  photo_urls: z.array(z.string().url()).max(10).optional(),
  reported_at: z.string().datetime().optional(),
  title: z.string().max(255).optional(),
  population_affected: z.number().int().min(0).optional(),
  vulnerability_index: z.number().min(0).max(1).optional(),
  consent: z.boolean().optional(),
});

export const ReportUpdateSchema = z.object({
  status: z.enum(["draft", "submitted", "under_review", "verified", "assigned", "in_progress", "resolved", "closed", "rejected", "duplicate_merged", "needs_survey"]).optional(),
  description: z.string().min(1).max(2000).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export const PhotoUploadRequestSchema = z.object({
  content_type: z.enum(["image/jpeg", "image/png"]),
  idempotency_key: z.string().uuid().optional(),
  file: z.string().min(1).optional(),
});

export const PhotoBatchUploadRequestSchema = z.object({
  photos: z.array(z.enum(["image/jpeg", "image/png"])).min(1).max(20),
});

export const SyncBatchSchema = z.object({
  reports: z.array(ReportCreateSchema).min(1).max(50),
});

export const AgentAssessRequestSchema = z.object({
  report_id: z.string().uuid(),
  idempotency_key: z.string().max(255).optional(),
});

export const SurveyorVisitSchema = z.object({
  findings: z.string(),
  checklist: z.array(z.object({
    item: z.string(),
    checked: z.boolean(),
  })),
  photo_urls: z.array(z.string()).optional(),
});

export const VerifikatorAcceptSchema = z.object({
  reason: z.string().optional(),
  assigned_unit_id: z.string().optional(),
  deadline: z.string().optional(),
  priority: z.number().optional(),
});

export const VerifikatorCombineSchema = z.object({
  target_case_id: z.string(),
  reason: z.string().optional(),
});

export const VerifikatorSeparateSchema = z.object({
  new_case_description: z.string(),
  reason: z.string().optional(),
});

export const VerifikatorRejectSchema = z.object({
  reason: z.string().min(10, "reason must be at least 10 chars"),
});

export const VerifikatorDecisionSchema = z.object({
  decision: z.enum(["valid", "needs_completion", "needs_survey", "duplicate", "out_of_scope", "rejected"]),
  reason: z.string().min(1, "reason is required"),
  duplicate_of_report_id: z.string().uuid().optional(),
  surveyor_id: z.string().uuid().optional(),
  assigned_unit_id: z.string().uuid().optional(),
  deadline: z.string().datetime().optional(),
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

export const RtRwVerifySchema = z.object({
  verification_token: z.string(),
  report_id: z.string(),
  verdict: z.union([z.literal("confirmed"), z.literal("rejected")]),
  reason: z.string().optional(),
});

export const AdminGenerateRtRwTokenSchema = z.object({
  report_id: z.string(),
  rt_rw_user_id: z.string(),
});

export const PhotoUploadReportIdSchema = z.object({
  report_id: z.string(),
});
