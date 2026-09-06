import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { PushConfiguration } from "../api/push-types";
import { useAuthStore } from "../stores/auth";
import {
  disableBrowserPush,
  enableBrowserPush,
  supportsBrowserPush,
} from "../lib/browser-push";

export function BrowserPushSettings() {
  const userId = useAuthStore((state) => state.user?.id);
  const [config, setConfig] = useState<PushConfiguration | null>(null);
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(true);
  const [error, setError] = useState(""),
    [testSent, setTestSent] = useState(false);
  const supported = supportsBrowserPush();
  useEffect(() => {
    let active = true;
    if (!supported) {
      setBusy(false);
      return;
    }
    Promise.all([
      api.pushConfiguration(),
      navigator.serviceWorker.getRegistration("/"),
    ])
      .then(async ([config, registration]) => {
        if (!active) return;
        let subscription = await registration?.pushManager.getSubscription();
        if (!active) return;
        if (
          subscription &&
          localStorage.getItem("sigap-push-user") !== userId
        ) {
          await (
            await caches.open("sigap-push-context")
          ).delete("/__sigap_push_owner");
          await subscription.unsubscribe();
          subscription = null;
        }
        if (
          subscription &&
          userId &&
          localStorage.getItem("sigap-push-user") === userId
        ) {
          await (
            await caches.open("sigap-push-context")
          ).put("/__sigap_push_owner", new Response(userId));
        }
        if (active) {
          setConfig(config);
          setEnabled(
            !!subscription &&
              localStorage.getItem("sigap-push-user") === userId,
          );
        }
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Pengaturan notifikasi gagal dimuat.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [userId, supported]);
  const toggle = async () => {
    setBusy(true);
    setError("");
    setTestSent(false);
    try {
      if (enabled) {
        try {
          await disableBrowserPush();
        } finally {
          setEnabled(false);
        }
      } else if (config?.web_push.public_key && userId) {
        await enableBrowserPush(config.web_push.public_key, userId);
        setEnabled(true);
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Pengaturan notifikasi gagal disimpan.",
      );
    } finally {
      setBusy(false);
    }
  };
  const sendTest = async () => {
    setBusy(true);
    setError("");
    setTestSent(false);
    try {
      const result = await api.testPush();
      if (!result.queued)
        throw new Error("Tes belum masuk antrean pengiriman.");
      setTestSent(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Tes notifikasi gagal dikirim.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="border rounded-xl p-4 mb-5">
      <h2 className="font-semibold">Notifikasi perangkat</h2>
      <p className="text-sm my-2">
        {!supported
          ? "Browser ini tidak mendukung notifikasi perangkat. Buka daftar notifikasi di halaman ini untuk mengikuti perubahan laporan."
          : config && !config.web_push.configured
            ? "Pengelola belum mengaktifkan pengiriman notifikasi ke browser. Gunakan daftar notifikasi di halaman ini untuk memeriksa perubahan laporan."
            : enabled
              ? "Anda telah mengaktifkan notifikasi pada browser ini. Browser dapat memberi tahu perubahan laporan saat halaman SIGAP tidak terbuka; izin dan pengaturan perangkat tetap memengaruhi penerimaan."
              : "Aktifkan notifikasi agar browser dapat memberi tahu perubahan laporan tanpa harus membuka daftar ini setiap saat."}
      </p>
      {error && (
        <p role="alert" className="text-sm mb-2">
          {error}
        </p>
      )}
      <button
        className="ref-button"
        disabled={
          busy ||
          !supported ||
          (!enabled &&
            (!config?.web_push.configured || !config.web_push.public_key))
        }
        onClick={() => void toggle()}
      >
        {busy
          ? "Memuat…"
          : enabled
            ? "Nonaktifkan notifikasi perangkat"
            : "Aktifkan notifikasi perangkat"}
      </button>
      {enabled && (
        <button
          className="ref-button ml-3"
          disabled={busy}
          onClick={() => void sendTest()}
        >
          Tes notifikasi
        </button>
      )}
      {testSent && (
        <p role="status" className="text-sm mt-2">
          Aplikasi sudah meminta pengiriman notifikasi percobaan. Periksa
          notifikasi perangkat; pesan ini belum memastikan perangkat telah
          menerimanya.
        </p>
      )}
    </section>
  );
}
