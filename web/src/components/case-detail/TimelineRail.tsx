import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { logger } from "@/lib/logger";

export interface TimelineEvent {
  time: string;
  description: string;
  dotColor: "amber" | "teal" | "gray";
}

interface TimelineRailProps {
  reportId: string;
}

export const TimelineRail = ({ reportId }: TimelineRailProps) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.reportTimeline(reportId);
      // Transform API response to TimelineEvent format
      const transformed: TimelineEvent[] = res.events.map((e) => {
        let dotColor: "amber" | "teal" | "gray" = "gray";
        if (e.status === "submitted" || e.status === "verified") dotColor = "teal";
        else if (e.status === "under_review" || e.status === "needs_survey") dotColor = "amber";
        return {
          time: new Date(e.occurred_at).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
          description: e.label,
          dotColor,
        };
      });
      setEvents(transformed);
    } catch (e) {
      logger.error("Failed to load timeline", { error: e });
      setError("Gagal memuat timeline");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (reportId) {
      loadTimeline();
    }
  }, [reportId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-3 h-3 rounded-full bg-neutral-200"></div>
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-neutral-200 rounded w-3/4"></div>
                <div className="h-2 bg-neutral-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <p className="text-sm text-danger-600">{error}</p>
        <button onClick={loadTimeline} className="mt-2 text-xs text-primary-600 hover:underline">
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5">
      <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Timeline</h4>
      <div className="space-y-4">
        {events.length === 0 ? (
          <p className="text-sm text-neutral-400">Tidak ada aktivitas</p>
        ) : (
          events.map((event, i) => (
            <div key={i} className="flex gap-3">
              <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                event.dotColor === "amber" ? "bg-warning-500" :
                event.dotColor === "teal" ? "bg-primary-500" : "bg-neutral-300"
              }`}></div>
              <div>
                <p className="text-sm text-neutral-700">{event.description}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{event.time}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
