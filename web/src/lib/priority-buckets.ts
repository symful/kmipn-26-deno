import type { ReportStatus } from "../types";

export type PriorityBucket = "" | "rendah" | "sedang" | "tinggi" | "kritis";
export type PublicPriorityBucket = "" | "high" | "medium" | "low";

export const PRIORITY_BUCKETS = {
  rendah: { label: "Rendah", labelEn: "Low", min: 0, max: 25 },
  sedang: { label: "Sedang", labelEn: "Medium", min: 26, max: 50 },
  tinggi: { label: "Tinggi", labelEn: "High", min: 51, max: 75 },
  kritis: { label: "Kritis", labelEn: "Critical", min: 76, max: 100 },
} as const;

export const PRIORITY_OPTIONS: { value: PriorityBucket; label: string }[] = [
  { value: "" as PriorityBucket, label: "Semua Prioritas" },
  { value: "rendah" as PriorityBucket, label: "Rendah" },
  { value: "sedang" as PriorityBucket, label: "Sedang" },
  { value: "tinggi" as PriorityBucket, label: "Tinggi" },
  { value: "kritis" as PriorityBucket, label: "Kritis" },
];

export const PUBLIC_PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Semua Prioritas" },
  { value: "high", label: "Prioritas Tinggi" },
  { value: "medium", label: "Prioritas Sedang" },
  { value: "low", label: "Prioritas Rendah" },
];

export const severityToBucket = (severity: number | null): PriorityBucket => {
  if (severity == null) return "" as PriorityBucket;
  if (severity <= 25) return "rendah" as PriorityBucket;
  if (severity <= 50) return "sedang" as PriorityBucket;
  if (severity <= 75) return "tinggi" as PriorityBucket;
  return "kritis" as PriorityBucket;
};

export const publicSeverityToBucket = (
  severity: number | null,
): PublicPriorityBucket => {
  if (severity == null) return "" as PublicPriorityBucket;
  if (severity >= 70) return "high" as PublicPriorityBucket;
  if (severity >= 40) return "medium" as PublicPriorityBucket;
  return "low" as PublicPriorityBucket;
};

export const bucketToSeverityRange = (
  bucket: PriorityBucket,
): [number, number] | null => {
  if (!bucket) return null;
  return [PRIORITY_BUCKETS[bucket].min, PRIORITY_BUCKETS[bucket].max];
};

export const publicBucketToSeverityRange = (
  bucket: PublicPriorityBucket,
): [number, number] | null => {
  if (!bucket) return null;
  if (bucket === "high") return [70, 100];
  if (bucket === "medium") return [40, 69];
  if (bucket === "low") return [0, 39];
  return null;
};
