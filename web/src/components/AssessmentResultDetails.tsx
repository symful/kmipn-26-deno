import { displayValue, fieldLabels } from "../lib/display-labels";
import { parseServerTimestamp } from "../lib/server-time";

import { Link } from "react-router-dom";
import type { AgentAssessment, AssessmentResult } from "../types";

const toolLabels: Record<string, string> = {
  collect_field_evidence: "Bukti dan pemeriksaan lapangan",
  assess_completeness: "Kelengkapan laporan",
  assess_media_quality: "Kualitas foto",
  assess_location_time_consistency: "Lokasi & waktu bukti",
  extract_damage_indicators: "Identifikasi kerusakan",
  classify_problem: "Klasifikasi masalah",
  find_duplicates: "Kandidat duplikat",
  detect_privacy_risk: "Perlindungan data pribadi",
};
const severityLabel = (value?: string) =>
  ({
    low: "Ringan",
    medium: "Sedang",
    high: "Berat",
    critical: "Kritis",
    unknown: "Belum dapat ditentukan",
  })[value ?? ""] ??
  value ??
  "Belum tersedia";
export function AssessmentSummary({
  assessments,
}: {
  assessments: AgentAssessment[];
}) {
  const done = assessments.filter((a) =>
    ["completed", "success"].includes(a.status),
  );
  const location = done.find(
    (a) => a.tool_name === "assess_location_time_consistency",
  )?.result;
  const damage = done.find(
    (a) => a.tool_name === "extract_damage_indicators",
  )?.result;
  const classification = done.find(
    (a) => a.tool_name === "classify_problem",
  )?.result;
  const category = (
    classification?.category_name ??
    classification?.category ??
    ""
  )
    .toLowerCase()
    .trim();
  const damageType = (damage?.damage_type ?? "").toLowerCase().trim();
  const roadPhoto =
    damage?.damage_visible === true &&
    ["pothole", "road_pothole", "lubang jalan"].includes(damageType);
  const waterText = ["air bersih", "air_bersih", "clean_water"].includes(
    category,
  );
  const mismatch = roadPhoto && waterText;
  const locationUnknown =
    location && (location.exif_gps == null || location.distance_meters == null);
  const pending = assessments.some((a) =>
    ["pending", "queued", "running"].includes(a.status),
  );
  return (
    <div className="my-4 space-y-3 text-sm">
      {mismatch ? (
        <>
          <h3 className="font-semibold">
            Uraian laporan dan foto perlu dicocokkan
          </h3>
          <p>
            Uraian laporan mengarah pada masalah air bersih, sedangkan foto
            menunjukkan lubang jalan. Periksa apakah kategori laporan perlu
            diperbaiki atau foto yang diunggah tidak sesuai. Jangan menentukan
            jenis pekerjaan sebelum perbedaan ini dijelaskan.
          </p>
        </>
      ) : damage?.damage_visible === true ? (
        <>
          <h3 className="font-semibold">Foto mendukung adanya kerusakan</h3>
          <p>
            Gunakan foto untuk memeriksa keluhan pelapor dan tentukan apakah
            kondisi tersebut sudah cukup jelas untuk ditangani atau masih
            memerlukan kunjungan lapangan.
          </p>
        </>
      ) : (
        <>
          <h3 className="font-semibold">Bukti laporan masih perlu ditinjau</h3>
          <p>
            Cocokkan uraian pelapor dengan foto yang tersedia. Jika kondisi yang
            dilaporkan belum terlihat jelas, minta bukti tambahan sebelum
            menentukan penanganan.
          </p>
        </>
      )}
      {locationUnknown && (
        <p>
          Lokasi pada foto belum dapat dibandingkan dengan titik laporan,
          sehingga foto saja belum memastikan tempat kejadian. Konfirmasikan
          melalui bukti tambahan atau pemeriksaan lapangan; kekurangan informasi
          lokasi tidak membuktikan laporan palsu.
        </p>
      )}
      {location &&
        !locationUnknown &&
        location.time_delta_hours != null &&
        location.consistent === false && (
          <p>
            Lokasi atau waktu foto juga berbeda dari laporan. Periksa apakah
            bukti tersebut berasal dari kejadian yang sama sebelum melanjutkan.
          </p>
        )}
      {pending && (
        <p role="status">
          Pemeriksaan masih berlangsung. Hasil berikutnya dapat menambah bahan
          pertimbangan.
        </p>
      )}
    </div>
  );
}
function EvidenceFacts({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) {
  let data = value;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return <span>{String(data)}</span>;
    }
  }
  if (data == null) return null;
  if (depth > 3) return <span>Rincian tambahan tersimpan.</span>;
  if (Array.isArray(data))
    return (
      <ul className="list-disc pl-4">
        {data.map((item, i) => (
          <li key={i}>
            <EvidenceFacts value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  if (typeof data === "object")
    return (
      <dl>
        {Object.entries(data)
          .filter(([key]) => fieldLabels[key])
          .map(([key, item]) => (
            <div key={key}>
              <dt className="font-medium">{fieldLabels[key]}</dt>
              <dd>
                <EvidenceFacts value={item} depth={depth + 1} />
              </dd>
            </div>
          ))}
      </dl>
    );
  return <span>{displayValue(data)}</span>;
}
export function AssessmentResultDetails({
  result: r,
  tool,
}: {
  result: AssessmentResult;
  tool: string;
}) {
  switch (tool) {
    case "assess_completeness":
      return r.complete === true ? null : (
        <div className="mt-3 text-sm">
          <p>
            {r.missing_fields?.length
              ? "Lengkapi bagian berikut agar laporan dapat ditindaklanjuti."
              : "Pemeriksaan belum menyebutkan bagian yang kurang. Tinjau isi laporan sebelum meminta tambahan informasi kepada pelapor."}
          </p>
          <ul className="list-disc pl-5">
            {[...new Set(r.missing_fields ?? [])].map((field) => (
              <li key={field}>
                {fieldLabels[field] ?? "Informasi tambahan laporan"}
              </li>
            ))}
          </ul>
        </div>
      );
    case "assess_media_quality":
      return (
        <p className="mt-3 text-sm">
          {r.quality_ok === true
            ? "Detail pada foto cukup jelas untuk ditinjau."
            : r.quality_ok === false
              ? "Unggah foto yang lebih jelas dan terang agar kondisi fasilitas dapat diperiksa."
              : "Gunakan bukti lain atau ulangi pemeriksaan foto sebelum menentukan tindak lanjut."}
        </p>
      );
    case "extract_damage_indicators":
      return (
        <div className="mt-3 text-sm">
          {r.damage_description && <p>{r.damage_description}</p>}
          {r.damage_visible === true && r.severity && (
            <p>
              Kerusakan yang terlihat dinilai{" "}
              {severityLabel(r.severity).toLowerCase()}. Cocokkan dengan kondisi
              lapangan sebelum menetapkan pekerjaan.
            </p>
          )}
          {r.damage_visible === false && (
            <p>
              Foto ini belum menunjukkan kerusakan. Periksa bukti lain apabila
              uraian pelapor menyebutkan kerusakan.
            </p>
          )}
        </div>
      );
    case "assess_location_time_consistency":
      return (
        <p className="mt-3 text-sm">
          {r.exif_gps == null || r.distance_meters == null
            ? "Informasi lokasi pada foto belum cukup untuk dibandingkan dengan titik laporan. Konfirmasikan lokasi melalui bukti tambahan atau kunjungan lapangan."
            : r.time_delta_hours == null
              ? "Lokasi foto dapat dibandingkan, tetapi waktu pengambilannya belum dapat dicocokkan. Periksa bukti tambahan bila waktu kejadian memengaruhi penanganan."
              : r.consistent === true
                ? "Tidak ditemukan perbedaan di luar batas pemeriksaan. Kesesuaian ini membantu pemeriksaan lokasi dan waktu, bukan memastikan seluruh isi laporan benar."
                : `Selisih lokasi sekitar ${Math.round(r.distance_meters)} meter dan waktu sekitar ${Math.round(r.time_delta_hours)} jam. Periksa apakah foto menggambarkan kejadian yang dilaporkan.`}
        </p>
      );
    case "find_duplicates":
      return (
        <div className="mt-3 text-sm">
          {r.candidates?.length ? (
            <>
              <p>
                Bandingkan lokasi, foto, dan uraian {r.candidates.length}{" "}
                laporan berikut. Kemiripan belum berarti laporan tersebut
                membahas kejadian yang sama.
              </p>
              <ul className="mt-2 space-y-2">
                {r.candidates.map((candidate) => (
                  <li key={candidate.report_id}>
                    <Link
                      className="block truncate underline"
                      title={candidate.description || candidate.report_id}
                      to={`/system/cases/${candidate.report_id}`}
                    >
                      {candidate.description ||
                        `Laporan ${candidate.report_id}`}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : r.duplicates_found === false ? (
            <p>Laporan dapat ditinjau sebagai laporan tersendiri.</p>
          ) : (
            <p>
              Daftar pembanding belum tersedia. Periksa laporan di sekitar
              lokasi sebelum menggabungkan.
            </p>
          )}
        </div>
      );
    case "classify_problem":
      return (
        <div className="mt-3 text-sm">
          {r.rationale && <p>{r.rationale}</p>}
          <p>
            Pengelompokan ini berdasarkan uraian pelapor. Untuk menentukan
            tingkat kerusakan, gunakan foto dan hasil pemeriksaan lapangan;
            uraian yang singkat belum menunjukkan kerusakan ringan.
          </p>
        </div>
      );
    case "detect_privacy_risk":
      return (
        <p className="mt-3 text-sm">
          {r.pii_detected === true
            ? `Tutup bagian yang memuat data pribadi sebelum foto ditampilkan kepada publik.${r.pii_types?.length ? " Periksa: " + r.pii_types.map(displayValue).join(", ") + "." : ""}`
            : r.pii_detected === false
              ? "Tidak ada bagian yang ditandai untuk ditutup pada pemeriksaan ini."
              : "Periksa foto secara langsung sebelum menampilkannya kepada publik."}
        </p>
      );
    case "collect_field_evidence":
      return (
        <div className="mt-3 space-y-3 text-sm">
          {r.visits?.length ? (
            r.visits.map((visit) => (
              <div key={visit.id}>
                <p>
                  Kunjungan{" "}
                  {parseServerTimestamp(visit.created_at).toLocaleString(
                    "id-ID",
                  )}
                </p>
                <EvidenceFacts value={visit.findings} />
                <div className="flex flex-wrap gap-2">
                  {visit.photo_urls?.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt="Bukti kunjungan lapangan"
                        className="w-24 h-20 object-cover rounded"
                      />
                    </a>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p>
              Tugaskan pemeriksaan lapangan jika laporan memerlukan kepastian
              kondisi di lokasi.
            </p>
          )}
        </div>
      );
    default:
      return (
        <p className="mt-3 text-sm">
          {r.summary || "Rincian pemeriksaan tersedia pada informasi teknis."}
        </p>
      );
  }
}
function assessmentOutcome(assessment: AgentAssessment): string {
  const r = assessment.result;
  switch (assessment.tool_name) {
    case "assess_completeness":
      return r.complete === true
        ? "Data laporan sudah lengkap"
        : r.complete === false
          ? "Laporan perlu dilengkapi"
          : "Kelengkapan laporan belum dapat ditentukan";
    case "assess_media_quality":
      return r.quality_ok === true
        ? "Foto dapat digunakan untuk pemeriksaan"
        : r.quality_ok === false
          ? "Foto perlu diperbaiki"
          : "Kelayakan foto belum dapat ditentukan";
    case "extract_damage_indicators":
      return r.damage_visible === true
        ? "Kerusakan terlihat pada foto"
        : r.damage_visible === false
          ? "Kerusakan tidak terlihat pada foto"
          : "Kerusakan belum dapat dinilai dari foto";
    case "assess_location_time_consistency":
      return r.exif_gps == null || r.distance_meters == null
        ? "Lokasi foto belum dapat dicocokkan"
        : r.time_delta_hours == null
          ? "Waktu foto belum dapat dicocokkan"
          : r.consistent === true
            ? "Lokasi dan waktu foto sesuai laporan"
            : "Lokasi atau waktu foto perlu diperiksa";
    case "find_duplicates":
      return r.duplicates_found === true
        ? "Ada laporan serupa yang perlu dibandingkan"
        : r.duplicates_found === false
          ? "Tidak ditemukan laporan serupa"
          : "Perbandingan laporan belum dapat disimpulkan";
    case "detect_privacy_risk":
      return r.pii_detected === true
        ? "Foto memuat data pribadi"
        : r.pii_detected === false
          ? "Tidak ditemukan data pribadi pada foto"
          : "Data pribadi pada foto belum dapat diperiksa";
    case "classify_problem":
      return r.category_name
        ? `Laporan berkaitan dengan ${r.category_name.toLowerCase()}`
        : "Jenis masalah belum dapat ditentukan";
    case "collect_field_evidence":
      return r.visits?.length
        ? `${r.visits.length} hasil kunjungan lapangan tersedia`
        : "Belum ada hasil kunjungan lapangan";
    default:
      return toolLabels[assessment.tool_name] ?? "Hasil pemeriksaan tambahan";
  }
}
export function AIAssessmentViewer({
  assessment,
  loading,
}: {
  assessment: AgentAssessment | null;
  loading?: boolean;
}) {
  if (loading) return <p role="status">Memuat penilaian AI…</p>;
  if (!assessment)
    return <p>Belum ada hasil AI. Jalankan pemeriksaan untuk melihat hasil.</p>;
  const completed = ["completed", "success"].includes(assessment.status),
    pending = ["pending", "queued", "running"].includes(assessment.status);
  const rawSupport =
      assessment.factors?.supporting ??
      assessment.result.supporting_factors ??
      [],
    rawRisks = assessment.factors?.risk ?? assessment.result.risk_factors ?? [];
  return (
    <details className="border rounded-lg p-3" open>
      <summary className="cursor-pointer text-sm font-semibold">
        {completed
          ? assessmentOutcome(assessment)
          : `${toolLabels[assessment.tool_name] ?? "Pemeriksaan tambahan"} — ${pending ? "sedang diproses" : "hasil belum tersedia"}`}
      </summary>

      {completed ? (
        <AssessmentResultDetails
          result={assessment.result}
          tool={assessment.tool_name}
        />
      ) : (
        <p className="ref-notice amber text-sm">
          {pending
            ? "Pemeriksaan belum selesai."
            : "Hasil pemeriksaan ini belum tersedia. Temuan dari pemeriksaan lain tetap dapat ditinjau."}
        </p>
      )}
      <details className="mt-3 text-xs">
        <summary>Informasi teknis pemeriksaan</summary>
        <p>
          {assessment.agent_version && (
            <>Versi pemeriksaan: {assessment.agent_version}</>
          )}
          {assessment.confidence != null && (
            <> · Keyakinan: {Math.round(assessment.confidence * 100)}%</>
          )}
        </p>
        <p>
          {parseServerTimestamp(assessment.created_at).toLocaleString("id-ID")}
        </p>
        <pre className="whitespace-pre-wrap break-words">
          {JSON.stringify(
            {
              hasil: assessment.result,
              faktor_pendukung: rawSupport,
              faktor_risiko: rawRisks,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </details>
  );
}
