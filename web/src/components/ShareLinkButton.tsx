import { useState } from "react";
import { api } from "../api/client";

interface ShareLinkButtonProps {
  filters: Record<string, string | string[]>;
  label?: string;
  className?: string;
}

export function ShareLinkButton({
  filters,
  label = "Bagikan Tautan",
  className = "",
}: ShareLinkButtonProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasFilters = Object.values(filters).some(
    (v) => v !== "" && (Array.isArray(v) ? v.length > 0 : true)
  );

  const handleShare = async () => {
    if (!hasFilters) {
      // No filters, just copy current URL
      navigator.clipboard.writeText(window.location.href).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
      return;
    }

    setLoading(true);
    try {
      // Default expiry: 7 days from now
      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const result = await api.shareReportFilter({ filters, expires_at: expiresAt });
      navigator.clipboard.writeText(result.share_url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch {
      // Fallback: copy current URL with filters
      const url = new URL(window.location.href);
      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v) => url.searchParams.append(key, v));
        } else if (value) {
          url.searchParams.set(key, value);
        }
      });
      navigator.clipboard.writeText(url.toString()).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={loading}
      className={`px-4 py-2 text-sm bg-sigap-primary text-white rounded-lg hover:bg-sigap-primaryHover transition-colors disabled:opacity-50 ${className}`}
    >
      {loading ? "Membuat tautan..." : copied ? "Tautan Disalin!" : label}
    </button>
  );
}
