export interface TaskSummary {
  id: string;
  report_id: string;
  assigned_to?: string | null;
  worker_id?: string | null;
  assigned_to_name?: string | null;
  worker_name?: string | null;
  status: string;
  instructions: string | null;
  deadline: string | null;
  progress_percent: number | null;
  created_at: string;
  updated_at: string;
  report_description: string;
  report_title?: string | null;
  lng: number;
  lat: number;
  photo_urls: string[];
  severity: number | null;
  report_address: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  unit_name: string;
  task_type?: "survei_verifikasi" | "perbaikan_fisik" | null;
  verification_status?: "pending" | "verified" | "rejected" | null;
  completion_evidence_urls?: string[] | string | null;
}
export interface TaskVisit {
  id: string;
  findings: string;
  dimensions?: string;
  recommendation?: string;
  notes?: string;
  condition_assessment?: string;
  photo_urls: string[];
  created_at: string;
}
export interface TaskDetailResponse {
  task: TaskSummary & { checklist: Array<{ item: string; checked: boolean }> };
  visits: TaskVisit[];
  evidence: Array<{
    id: string;
    photo_urls: string[];
    notes: string | null;
    created_at: string;
  }>;
  clarifications: Array<{ id: string; message: string; created_at: string }>;
}
export interface TaskListResponse {
  data: TaskSummary[];
}
