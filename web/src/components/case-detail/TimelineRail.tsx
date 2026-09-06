import { valueLabels } from "../../lib/display-labels";
import { parseServerTimestamp } from "../../lib/server-time";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { logger } from "@/lib/logger";
import { extendedColors } from "../../theme/tokens";

export interface TimelineEvent {
  time: string;
  description: string;
  dotColor: "amber" | "teal" | "gray";
  actor?: string | null;
  tag?: string;
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
      const transformed: TimelineEvent[] = res.data.map((e) => {
        let dotColor: "amber" | "teal" | "gray" = "gray";
        if (e.status === "submitted" || e.status === "verified")
          dotColor = "teal";
        else if (e.status === "under_review" || e.status === "needs_survey")
          dotColor = "amber";
        return {
          time: parseServerTimestamp(e.occurred_at).toLocaleDateString(
            "id-ID",
            {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            },
          ),
          description:
            /^Status\s*→\s*\w+$/.test(e.label) &&
            valueLabels[e.label.split("→")[1]!.trim()]
              ? `Status diubah menjadi ${valueLabels[e.label.split("→")[1]!.trim()]!.toLowerCase()}`
              : e.label,
          dotColor,
          actor: e.actor_name ?? e.actor,
        };
      });
      setEvents(transformed);
    } catch (e) {
      logger.error("Failed to load timeline", { error: e });
      setError("Gagal memuat riwayat laporan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (reportId) {
      loadTimeline();
    } else {
      setLoading(false);
    }
  }, [reportId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => (
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
        <button
          onClick={loadTimeline}
          className="mt-2 text-xs text-primary-600 hover:underline"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <section className="ref-card">
      <h2>Riwayat laporan</h2>
      <div className="ref-timeline">
        {events.length === 0 ? (
          <p>Tidak ada aktivitas</p>
        ) : (
          events.map((event, index) => (
            <div className="ref-event" key={index}>
              <h3>{event.description}</h3>
              <small>{event.time}</small>
              <p>
                {event.actor || "Sistem"}
                {event.tag ? ` · ${event.tag}` : ""}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
