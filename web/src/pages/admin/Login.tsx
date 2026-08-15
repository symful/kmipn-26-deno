import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../stores/auth";
import { api } from "../../api/client";
import { colors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

export const AdminLogin = () => {
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
      setError(`Login error: ${errorParam}`);
      return;
    }

    if (accessToken && refreshToken) {
      const user = useAuthStore.getState().user;
      if (!user) {
        localStorage.setItem("access_token", accessToken);
        api.authMeData()
          .then((data) => {
            setAuth({
              accessToken,
              refreshToken,
              user: data.user,
            });
            navigate("/admin");
          })
          .catch((e) => {
            logger.error("Failed to complete login", { error: e });
            setError("Failed to complete login");
          });
      } else {
        navigate("/admin");
      }
    }
  }, [searchParams, setAuth, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      setAuth({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user,
      });
      navigate("/admin");
    } catch (err) {
      logger.error("Failed to login", { error: err });
      const error = err as Error & { status?: number };
      let message: string;
      if (!email) {
        message = "Email harus diisi";
      } else if (error.status === 401) {
        message = "Email atau password salah";
      } else if (error.status === 403) {
        message = "Akun tidak memiliki akses";
      } else if (error.status && error.status >= 500) {
        message = "Server sedang bermasalah, coba lagi nanti";
      } else if (error.message === "Failed to fetch" || error.message === "NetworkError" || error.message === "network error") {
        message = "Tidak ada koneksi internet";
      } else {
        message = error.message || "Login gagal";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sigap-background">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md border border-sigap-border"
      >
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: colors.primary }}
          >
            S
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SIGAP Admin</h1>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1 text-sigap-textSecondary">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-sigap-border rounded focus:outline-none focus:border-sigap-primary bg-sigap-surface"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1 text-sigap-textSecondary">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-sigap-border rounded focus:outline-none focus:border-sigap-primary bg-sigap-surface"
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full text-white py-2 rounded font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: colors.primary }}
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>

        </div>
      </form>
    </div>
  );
};
