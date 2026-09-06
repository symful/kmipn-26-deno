import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { api } from "../api/client";
import { colors, extendedColors } from "../theme/tokens";
import type { Role } from "../types";
import { logger } from "@/lib/logger";

export const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");
    const expiresIn = searchParams.get("expires_in");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(
        "Kami belum dapat menyelesaikan proses masuk. Coba masuk kembali menggunakan akun administrator.",
      );
      return;
    }

    if (accessToken && refreshToken) {
      useAuthStore.setState({ accessToken, refreshToken, user: null });
      api
        .authMeData()
        .then((user) => {
          if (user.role !== "ADMIN") {
            useAuthStore.setState({
              accessToken: null,
              refreshToken: null,
              user: null,
            });
            setError(
              "Portal web khusus administrator. Gunakan aplikasi SIGAP untuk akun warga atau petugas.",
            );
            return;
          }
          setAuth({ accessToken, refreshToken, user });
          navigate("/system", { replace: true });
        })
        .catch(() => {
          useAuthStore.setState({
            accessToken: null,
            refreshToken: null,
            user: null,
          });
          setError("Gagal menyelesaikan login. Silakan masuk kembali.");
        });
    }
  }, [searchParams, setAuth, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      if (data.user.role !== "ADMIN") {
        useAuthStore.setState({
          accessToken: null,
          refreshToken: null,
          user: null,
        });
        setError(
          "Portal web khusus administrator. Gunakan aplikasi SIGAP untuk akun warga atau petugas.",
        );
        return;
      }
      setAuth({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: { ...data.user, role: data.user.role as Role },
      });
      navigate("/system");
    } catch (err) {
      logger.error("Failed to login", { error: err });
      const error = err as Error & { status?: number };
      const message = error && error.message ? error.message : "Login gagal";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: colors.bgSurface }}
    >
      <header
        className="bg-white border-b px-4 md:px-7 h-16 flex items-center justify-between flex-shrink-0"
        style={{ borderColor: colors.borderCard }}
      >
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <div
            className="w-7 h-7 rounded-[7px] flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: colors.primary }}
          >
            S
          </div>
          <span
            className="text-[15px] font-bold tracking-tight"
            style={{ color: colors.textPrimary }}
          >
            SIGAP
          </span>
        </Link>
        <Link
          to="/"
          className="px-[14px] py-2 rounded-lg border font-semibold hover:opacity-90 transition-opacity no-underline"
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            borderColor: colors.borderCard,
            color: colors.textSecondary,
            backgroundColor: "transparent",
          }}
        >
          Portal Publik
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div
          className="bg-white p-8 rounded-2xl shadow-sm w-full max-w-md border"
          style={{ borderColor: colors.borderCard }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm"
              style={{ backgroundColor: colors.primary }}
            >
              S
            </div>
            <div>
              <h1
                className="text-xl font-bold tracking-tight"
                style={{ color: colors.textPrimary }}
              >
                SIGAP
              </h1>
              <p className="text-xs" style={{ color: colors.textTertiary }}>
                Sistem Informasi Tanggap & Penanganan Masalah
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-xs font-semibold mb-1.5"
                style={{ color: colors.textPrimary }}
              >
                Email Pengguna
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 transition-all"
                style={{
                  borderColor: colors.borderCard,
                  color: colors.textPrimary,
                }}
                placeholder="nama@sigap.live"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  className="block text-xs font-semibold"
                  style={{ color: colors.textPrimary }}
                >
                  Kata Sandi
                </label>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 transition-all"
                style={{
                  borderColor: colors.borderCard,
                  color: colors.textPrimary,
                }}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div
                className="text-xs p-3 rounded-lg border"
                style={{
                  color: colors.danger,
                  backgroundColor: colors.dangerBg,
                  borderColor: extendedColors.dangerBorder,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:opacity-95"
              style={{ backgroundColor: colors.primary }}
            >
              {loading ? "Memproses..." : "Masuk ke Sistem"}
            </button>
          </form>
          <div
            className="mt-6 pt-5 border-t"
            style={{ borderColor: colors.borderCard }}
          >
            <p className="text-xs mb-2" style={{ color: colors.textSecondary }}>
              Akun demo
            </p>
            <button
              type="button"
              className="ref-button"
              onClick={() => {
                setEmail("admin@sigap.live");
                setPassword("admin123");
              }}
            >
              Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
