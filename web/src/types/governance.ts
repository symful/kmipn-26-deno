import type { ReportStatus } from "./index";
export interface IntegrationConnector {
  id: string;
  name: string;
  configured: boolean;
  status: "unconfigured" | "unavailable";
  reason: string;
  last_sync: string | null;
  records_sent: number | null;
}
export interface IntegrationsResponse {
  connectors: IntegrationConnector[];
  available_count: number;
  configured_count: number;
  record_count: number;
}
export interface PublicReportDetail {
  id: string;
  category_id: string;
  title: string;
  description: string;
  status: ReportStatus;
  severity: number | null;
  created_at: string;
  last_updated: string;
  public_progress: number | null;
  moderated_photo_url: string | null;
  generalized_location: string | null;
}
