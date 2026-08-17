import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/auth";

type Theme = "light" | "dark";
type Lang = "id" | "en";

interface NotificationPrefs {
  email: boolean;
  sms: boolean;
  push: boolean;
}

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sigap-primary focus:ring-offset-2 ${
        checked ? "bg-sigap-primary" : "bg-neutral-200"
      }`}
    >
      <span
        className={`inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white shadow-toggle-thumb transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      >
        {checked && <CheckIcon />}
      </span>
    </button>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-sigap-border p-5">
      <h3 className="text-sm font-semibold text-sigap-textPrimary mb-4">{title}</h3>
      {children}
    </div>
  );
}

function SettingRow({ label, description, action }: { label: string; description?: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-sigap-border last:border-b-0">
      <div>
        <p className="text-sm font-medium text-sigap-textPrimary">{label}</p>
        {description && <p className="text-xs text-sigap-textMuted mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export const Settings = () => {
  const user = useAuthStore((s) => s.user);

  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme) || "light";
  });
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem("lang") as Lang) || "id";
  });
  const [notifications, setNotifications] = useState<NotificationPrefs>(() => {
    const stored = localStorage.getItem("notificationPrefs");
    return stored ? JSON.parse(stored) : { email: true, sms: false, push: true };
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("notificationPrefs", JSON.stringify(notifications));
  }, [notifications]);

  const handleThemeToggle = () => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLangChange = (newLang: Lang) => {
    setLang(newLang);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleNotificationChange = (key: keyof NotificationPrefs) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const roleLabel: Record<string, string> = {
    ADMIN: "Administrator",
    ADMIN_DAERAH: "Admin Daerah",
    OPERATOR: "Operator",
    VERIFIKATOR: "Verifikator",
    SURVEYOR: "Surveyor",
    PETUGAS: "Petugas",
    RT_RW: "RT/RW",
    PENGAMBIL_KEPUTUSAN: "Pengambil Keputusan",
    AUDITOR: "Auditor",
  };

  return (
    <div className="min-h-[100dvh] bg-sigap-surface">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-sigap-textPrimary">Pengaturan</h1>
          <p className="text-sm text-sigap-textMuted mt-1">Kelola preferensi akun dan aplikasi</p>
        </div>

        {saved && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
            <CheckIcon />
            Perubahan disimpan
          </div>
        )}

        <SectionCard title="Akun">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-sigap-primary flex items-center justify-center text-white font-bold text-lg">
              {user?.name?.slice(0, 2).toUpperCase() ?? "US"}
            </div>
            <div>
              <p className="text-base font-semibold text-sigap-textPrimary">{user?.name ?? "Pengguna"}</p>
              <p className="text-sm text-sigap-textMuted">{user?.role ? roleLabel[user.role] ?? user.role : "-"}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Tampilan">
          <SettingRow
            label="Mode Gelap"
            description="Aktifkan tema gelap untuk mengurangi ketegangan mata"
            action={
              <div className="flex items-center gap-2">
                <span className="text-xs text-sigap-textMuted">{theme === "light" ? "Terang" : "Gelap"}</span>
                <button
                  onClick={handleThemeToggle}
                  className={`inline-flex items-center justify-center w-10 h-6 rounded-full transition-colors ${
                    theme === "dark" ? "bg-sigap-primary" : "bg-neutral-200"
                  }`}
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <MoonIcon /> : <SunIcon />}
                </button>
              </div>
            }
          />
        </SectionCard>

        <SectionCard title="Bahasa">
          <SettingRow
            label="Bahasa Aplikasi"
            description="Pilih bahasa yang digunakan di antarmuka"
            action={
              <select
                value={lang}
                onChange={(e) => handleLangChange(e.target.value as Lang)}
                className="px-3 py-2 rounded-lg border border-sigap-border text-sm text-sigap-textPrimary bg-white focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              >
                <option value="id">Indonesia</option>
                <option value="en">English</option>
              </select>
            }
          />
        </SectionCard>

        <SectionCard title="Notifikasi">
          <SettingRow
            label="Notifikasi Email"
            description="Terima pemberitahuan melalui email"
            action={
              <Toggle
                checked={notifications.email}
                onChange={() => handleNotificationChange("email")}
                label="Notifikasi email"
              />
            }
          />
          <SettingRow
            label="Notifikasi SMS"
            description="Terima pemberitahuan melalui SMS"
            action={
              <Toggle
                checked={notifications.sms}
                onChange={() => handleNotificationChange("sms")}
                label="Notifikasi SMS"
              />
            }
          />
          <SettingRow
            label="Notifikasi Push"
            description="Terima pemberitahuan push di browser"
            action={
              <Toggle
                checked={notifications.push}
                onChange={() => handleNotificationChange("push")}
                label="Notifikasi push"
              />
            }
          />
        </SectionCard>
      </div>
    </div>
  );
};
