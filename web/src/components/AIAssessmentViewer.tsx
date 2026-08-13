import type { AgentAssessment } from "../types";

interface AIAssessmentViewerProps {
  assessment: AgentAssessment | null;
  loading?: boolean;
}

export const AIAssessmentViewer = ({
  assessment,
  loading,
}: AIAssessmentViewerProps) => {
  if (loading) {
    return (
      <div className="bg-sigap-surface rounded-lg p-4 border border-sigap-border">
        <p className="text-sm text-sigap-textMuted italic">
          Memuat assessment...
        </p>
      </div>
    );
  }
  if (!assessment) {
    return (
      <div className="bg-sigap-surface rounded-lg p-4 border border-sigap-border">
        <p className="text-sm text-sigap-textMuted italic">
          Belum ada AI assessment
        </p>
      </div>
    );
  }
  return (
    <div className="bg-sigap-surface rounded-lg p-4 border border-sigap-border space-y-3">
      <h4 className="font-semibold text-sm text-sigap-textPrimary">
        AI Assessment
      </h4>
      {assessment.vision_description && (
        <div>
          <p className="text-xs font-medium text-sigap-textTertiary mb-1">
            Deskripsi
          </p>
          <p className="text-sm text-sigap-textSecondary">
            {assessment.vision_description}
          </p>
        </div>
      )}
      {assessment.damage_severity != null && (
        <div>
          <p className="text-xs font-medium text-sigap-textTertiary mb-1">
            Tingkat Kerusakan
          </p>
          <p className="text-sm font-semibold">
            {assessment.damage_severity}%
          </p>
        </div>
      )}
      {assessment.duplicate_candidates &&
        assessment.duplicate_candidates.length > 0 && (
          <div>
            <p className="text-xs font-medium text-sigap-textTertiary mb-1">
              Kandidat Duplikat
            </p>
            <ul className="text-sm text-sigap-textSecondary space-y-1">
              {assessment.duplicate_candidates.map((c, i) => (
                <li key={i}>
                  {String(c.report_id)} — {Number(c.distance_m)}m
                </li>
              ))}
            </ul>
          </div>
        )}
      {assessment.confidence != null && (
        <div>
          <p className="text-xs font-medium text-sigap-textTertiary mb-1">
            Confidence
          </p>
          <p className="text-sm font-semibold">
            {(assessment.confidence * 100).toFixed(0)}%
          </p>
        </div>
      )}
      {assessment.recommended_status && (
        <div>
          <p className="text-xs font-medium text-sigap-textTertiary mb-1">
            Rekomendasi Status
          </p>
          <p className="text-sm font-semibold text-sigap-primary">
            {assessment.recommended_status}
          </p>
        </div>
      )}
      <p className="text-xs text-sigap-textMuted">
        Model: {assessment.model_version ?? "N/A"} | Tool calls:{" "}
        {assessment.tool_calls_made ?? 0} |{" "}
        {assessment.latency_ms
          ? `${(assessment.latency_ms / 1000).toFixed(1)}s`
          : "N/A"}
      </p>
    </div>
  );
};
