import type { Report } from "../types";
import { StatusBadge } from "./StatusBadge";
import { colors } from "../theme/tokens";

interface DuplicateComparisonProps {
  reportA: Report;
  reportB: Report;
}

interface FieldRowProps {
  label: string;
  valueA: React.ReactNode;
  valueB: React.ReactNode;
  isDifferent?: boolean;
}

const FieldRow = ({ label, valueA, valueB, isDifferent }: FieldRowProps) => (
  <tr className={isDifferent ? "bg-amber-50" : ""}>
    <td className="py-2 pr-4 text-xs text-sigap-textTertiary w-28 align-top">{label}</td>
    <td className={`py-2 pr-4 text-sm ${isDifferent ? "text-amber-800 font-medium" : "text-sigap-textSecondary"}`}>
      {valueA}
    </td>
    <td className={`py-2 text-sm ${isDifferent ? "text-amber-800 font-medium" : "text-sigap-textSecondary"}`}>
      {valueB}
    </td>
  </tr>
);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const DuplicateComparison = ({ reportA, reportB }: DuplicateComparisonProps) => {
  const categoryA = reportA.category?.name ?? reportA.category_id;
  const categoryB = reportB.category?.name ?? reportB.category_id;

  const fields: FieldRowProps[] = [
    {
      label: "ID",
      valueA: <span className="font-mono text-xs">{reportA.id}</span>,
      valueB: <span className="font-mono text-xs">{reportB.id}</span>,
      isDifferent: reportA.id !== reportB.id,
    },
    {
      label: "Kategori",
      valueA: categoryA,
      valueB: categoryB,
      isDifferent: categoryA !== categoryB,
    },
    {
      label: "Status",
      valueA: <StatusBadge status={reportA.status} />,
      valueB: <StatusBadge status={reportB.status} />,
      isDifferent: reportA.status !== reportB.status,
    },
    {
      label: "Dibuat",
      valueA: formatDate(reportA.created_at),
      valueB: formatDate(reportB.created_at),
      isDifferent: reportA.created_at !== reportB.created_at,
    },
    {
      label: "Lokasi",
      valueA: reportA.lat != null && reportA.lng != null
        ? `${reportA.lat.toFixed(6)}, ${reportA.lng.toFixed(6)}`
        : "-",
      valueB: reportB.lat != null && reportB.lng != null
        ? `${reportB.lat.toFixed(6)}, ${reportB.lng.toFixed(6)}`
        : "-",
      isDifferent: reportA.lat !== reportB.lat || reportA.lng !== reportB.lng,
    },
    {
      label: "Severity",
      valueA: reportA.severity != null ? `${reportA.severity}%` : "-",
      valueB: reportB.severity != null ? `${reportB.severity}%` : "-",
      isDifferent: reportA.severity !== reportB.severity,
    },
    {
      label: "Ditugaskan",
      valueA: reportA.assignee?.name ?? "-",
      valueB: reportB.assignee?.name ?? "-",
      isDifferent: reportA.assignee?.name !== reportB.assignee?.name,
    },
  ];

  const anyDifferent = fields.some((f) => f.isDifferent);

  return (
    <div className="bg-white rounded-lg border border-sigap-border overflow-hidden">
      <div className="px-4 py-3 border-b border-sigap-border bg-gray-50">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: colors.perluTindakan }}
          />
          <h3 className="text-sm font-semibold text-sigap-textPrimary">
            Perbandingan Laporan Duplikat
          </h3>
        </div>
      </div>

      {anyDifferent && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
          <p className="text-xs text-amber-700">
            Baris yang <strong>dihighlight</strong> menunjukkan perbedaan antara kedua laporan.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-sigap-border">
              <th className="py-2 pr-4 text-left text-xs font-medium text-sigap-textTertiary w-28">Field</th>
              <th className="py-2 pr-4 text-left text-xs font-medium text-sigap-textTertiary">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: colors.primary }}
                  />
                  Laporan A
                </span>
              </th>
              <th className="py-2 text-left text-xs font-medium text-sigap-textTertiary">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: colors.diproses }}
                  />
                  Laporan B
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => (
              <FieldRow key={i} {...field} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-sigap-border bg-gray-50">
        <h4 className="text-xs font-semibold text-sigap-textSecondary mb-2">Deskripsi</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-3 rounded text-sm ${reportA.description !== reportB.description ? "bg-amber-50 border border-amber-100" : ""}`}>
            <p className="text-sigap-textSecondary whitespace-pre-wrap">{reportA.description}</p>
          </div>
          <div className={`p-3 rounded text-sm ${reportA.description !== reportB.description ? "bg-amber-50 border border-amber-100" : ""}`}>
            <p className="text-sigap-textSecondary whitespace-pre-wrap">{reportB.description}</p>
          </div>
        </div>
      </div>

      {reportA.photo_urls.length > 0 && (
        <div className="px-4 py-3 border-t border-sigap-border">
          <h4 className="text-xs font-semibold text-sigap-textSecondary mb-2">
            Foto ({reportA.photo_urls.length} vs {reportB.photo_urls.length})
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              {reportA.photo_urls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Foto A ${i + 1}`}
                  className="w-full h-32 object-cover rounded border border-sigap-border"
                />
              ))}
            </div>
            <div className="space-y-2">
              {reportB.photo_urls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Foto B ${i + 1}`}
                  className="w-full h-32 object-cover rounded border border-sigap-border"
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
