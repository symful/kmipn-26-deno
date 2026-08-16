import React from "react";
import { colors } from "../../theme/tokens";
import { dangerBorder } from "../../theme/tokens";

export interface DataQualityPanelProps {
  qualityPercent: number;
  waitingCount: number;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

export function DataQualityPanel({
  qualityPercent,
  waitingCount,
  isLoading = false,
  isError = false,
  errorMessage = "Gagal memuat kualitas data",
  onRetry,
}: DataQualityPanelProps) {
  if (isLoading) {
    return (
      <div
        className="bg-white rounded-lg p-4 border border-sigap-border flex flex-col gap-2"
        style={{
          borderColor: colors.border,
        }}
      >
        <div
          className="h-4 w-40 rounded animate-pulse"
          style={{ backgroundColor: colors.border }}
        />
        <div
          className="h-10 w-24 rounded animate-pulse"
          style={{ backgroundColor: colors.border }}
        />
        <div
          className="h-4 w-52 rounded animate-pulse"
          style={{ backgroundColor: colors.border }}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="bg-white rounded-lg p-4 border border-sigap-border flex flex-col gap-2 items-center justify-center"
        style={{
          borderColor: colors.border,
        }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: dangerBorder }}
        >
          <svg width="20" height="20" fill="none" stroke={colors.perluTindakan} strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm text-sigap-textSecondary text-center">{errorMessage}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 text-xs font-medium text-white rounded transition-colors"
            style={{ backgroundColor: colors.primary }}
          >
            Coba lagi
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg p-4 border border-sigap-border flex flex-col gap-2"
      style={{
        borderColor: colors.border,
      }}
    >
      <div className="text-sm text-sigap-textTertiary">
        Kualitas & sinkronisasi data
      </div>

      <div className="flex items-end gap-2">
        <span
          className="text-4xl font-bold tracking-tight"
          style={{ color: colors.selesai }}
        >
          {qualityPercent}%
        </span>
      </div>

      <div className="text-sm text-sigap-textTertiary">
        {waitingCount} menunggu koneksi surveyor
      </div>
    </div>
  );
}
