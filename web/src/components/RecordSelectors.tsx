import { useEffect, useState } from "react";
import { api } from "../api/client";

export function CategorySelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [categories, setCategories] = useState<
    Awaited<ReturnType<typeof api.categories>>["data"]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    api
      .categories()
      .then((result) => {
        if (active) setCategories(result.data);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <div>
      <select
        required
        className="ref-input w-full"
        aria-label="Kategori"
        value={value}
        disabled={loading || error}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {loading ? "Memuat kategori…" : "Pilih kategori"}
        </option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert">
          Daftar kategori belum dapat dimuat.{" "}
          <button
            type="button"
            className="ref-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Coba lagi
          </button>
        </p>
      )}
    </div>
  );
}

export function ReportSelector({
  value,
  onChange,
  excludeId,
}: {
  value: string;
  onChange: (id: string) => void;
  excludeId?: string;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof api.reports>>["data"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api
        .reports({ search: query, limit: 30 })
        .then((result) => {
          if (active)
            setItems(result.data.filter((report) => report.id !== excludeId));
        })
        .catch(() => {
          if (active) setError("Daftar laporan belum dapat dimuat.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, excludeId, retry]);
  return (
    <div className="space-y-2">
      <input
        className="ref-input w-full"
        aria-label="Cari laporan utama"
        placeholder="Cari judul atau nomor laporan"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
        }}
      />
      <select
        className="ref-input w-full"
        aria-label="Laporan utama"
        value={value}
        disabled={loading || !!error}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {loading ? "Mencari laporan…" : "Pilih laporan utama"}
        </option>
        {items.map((report) => (
          <option key={report.id} value={report.id}>
            {report.title || report.description || "Laporan"} ·{" "}
            {report.id.slice(0, 8)}
          </option>
        ))}
      </select>
      {!loading && !error && !items.length && (
        <p className="text-xs">Tidak ada laporan yang sesuai.</p>
      )}
      {!loading && !error && items.length >= 29 && (
        <p className="text-xs">
          Persempit pencarian dengan judul atau nomor laporan.
        </p>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            className="ref-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Coba lagi
          </button>
        </p>
      )}
    </div>
  );
}

export function UnitSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [units, setUnits] = useState<
    Awaited<ReturnType<typeof api.units>>["items"]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    api
      .units()
      .then((result) => {
        if (active) setUnits(result.items.filter((unit) => unit.is_active));
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <div>
      <select
        className="ref-input w-full"
        aria-label="Unit penerima"
        value={value}
        disabled={loading || error}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {loading ? "Memuat unit…" : "Tanpa penugasan unit"}
        </option>
        {units.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.nama}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert">
          Daftar unit belum dapat dimuat.{" "}
          <button
            type="button"
            className="ref-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Coba lagi
          </button>
        </p>
      )}
    </div>
  );
}
