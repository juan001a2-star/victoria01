import { useState, useEffect, useCallback } from "react";
import {
  Bell, Palette, Image, Lock, Fingerprint, Ticket, Globe,
  ChevronRight, ChevronDown, Check, X
} from "lucide-react";
import type { SessionUser } from "@/store";
import { trpc } from "@/providers/trpc";
import { LANG_NAMES, t, type Lang } from "@/i18n";

interface SettingsScreenProps {
  user: SessionUser;
  onLanguageChange: (lang: Lang) => void;
}

const NOTIF_KEY = "bv_notifications";
const THEME_KEY = "bv_theme_color";
const FP_KEY = "bv_fingerprint";
const TICKETS_FILTER_KEY = "bv_tickets_filter";

type NotifPrefs = {
  enabled: boolean;
  winningTickets: boolean;
  saleCreditPayment: boolean;
  prizePayment: boolean;
  updateAvailable: boolean;
};

const defaultNotifs: NotifPrefs = {
  enabled: true,
  winningTickets: true,
  saleCreditPayment: true,
  prizePayment: true,
  updateAvailable: true,
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

/** Dispara una notificación del sistema si el usuario lo permitió y está activa la preferencia. */
export function pushAppNotification(title: string, body: string, kind: keyof Omit<NotifPrefs, "enabled">) {
  try {
    const prefs = loadJson(NOTIF_KEY, defaultNotifs);
    if (!prefs.enabled || !prefs[kind]) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification(title, {
      body,
      icon: "/icon-144x144.png",
      tag: `bv-${kind}-${Date.now()}`,
      silent: false,
    });
  } catch { /* ignore */ }
}

const THEME_COLORS = [
  { id: "green", label: "Verde", from: "#16a34a", to: "#15803d", light: "#dcfce7", soft: "#bbf7d0" },
  { id: "blue", label: "Azul", from: "#2563eb", to: "#1d4ed8", light: "#dbeafe", soft: "#bfdbfe" },
  { id: "purple", label: "Morado", from: "#7c3aed", to: "#6d28d9", light: "#ede9fe", soft: "#ddd6fe" },
  { id: "orange", label: "Naranja", from: "#ea580c", to: "#c2410c", light: "#ffedd5", soft: "#fed7aa" },
  { id: "teal", label: "Turquesa", from: "#0d9488", to: "#0f766e", light: "#ccfbf1", soft: "#99f6e4" },
];

/** Aplica el color de tema a toda la app (CSS variables). */
export function applyAppTheme(id: string) {
  const theme = THEME_COLORS.find((c) => c.id === id) || THEME_COLORS[0];
  const root = document.documentElement;
  root.style.setProperty("--bv-primary", theme.from);
  root.style.setProperty("--bv-primary-dark", theme.to);
  root.style.setProperty("--bv-primary-light", theme.light);
  root.style.setProperty("--bv-primary-soft", theme.soft);
  root.style.setProperty("--lottery-green", theme.from);
  root.style.setProperty("--lottery-dark", theme.to);
  root.style.setProperty("--lottery-light", theme.light);
  root.style.setProperty("--lottery-accent", theme.from);
}

export default function SettingsScreen({ user, onLanguageChange }: SettingsScreenProps) {
  const lang = (user.language || "es") as Lang;
  const setLanguageMut = trpc.lotteryUser.setLanguage.useMutation();
  const changePasswordMut = trpc.lotteryUser.changePassword.useMutation();
  const registerFpMut = trpc.lotteryUser.registerFingerprint.useMutation();
  const clearFpMut = trpc.lotteryUser.clearFingerprint.useMutation();

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotifPrefs>(() => loadJson(NOTIF_KEY, defaultNotifs));
  const [ticketsFilter, setTicketsFilter] = useState<"img" | "pdf">(() => {
    try {
      const v = localStorage.getItem(TICKETS_FILTER_KEY) || "pdf";
      // migrar valores antiguos
      if (v === "open") return "img";
      if (v === "closed") return "pdf";
      return v === "img" ? "img" : "pdf";
    } catch {
      return "pdf";
    }
  });
  const [themeColor, setThemeColor] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || "green";
    } catch {
      return "green";
    }
  });
  const [fingerprintEnabled, setFingerprintEnabled] = useState(() => {
    try {
      return localStorage.getItem(FP_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showColorModal, setShowColorModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [msg, setMsg] = useState("");
  const [msgError, setMsgError] = useState(false);
  const showMsg = (m: string, error = false) => {
    setMsg(m);
    setMsgError(error);
    setTimeout(() => setMsg(""), 3000);
  };

  useEffect(() => {
    setWebAuthnSupported(
      typeof window !== "undefined" &&
        !!window.PublicKeyCredential &&
        typeof navigator.credentials?.create === "function"
    );
  }, []);

  useEffect(() => {
    applyTheme(themeColor);
  }, [themeColor]);

  const changeLanguage = (l: Lang) => {
    if (l === lang) return;
    setLanguageMut.mutate({ language: l });
    onLanguageChange(l);
    showMsg(t(l, "settings_language_changed") || "Idioma actualizado");
  };

  const persistNotifs = useCallback((next: NotifPrefs) => {
    setNotifications(next);
    saveJson(NOTIF_KEY, next);
  }, []);

  const toggleNotif = async (key: keyof NotifPrefs) => {
    const next = { ...notifications, [key]: !notifications[key] };
    // Al activar notificaciones globales, pedir permiso del navegador
    if (key === "enabled" && next.enabled && typeof Notification !== "undefined") {
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          showMsg(t(lang, "settings_notif_denied"), true);
          next.enabled = false;
        }
      } else if (Notification.permission === "denied") {
        showMsg(t(lang, "settings_notif_denied"), true);
        next.enabled = false;
      }
    }
    persistNotifs(next);
    if (key === "enabled" && next.enabled) {
      showMsg(t(lang, "settings_notif_enabled_ok"));
    }
  };

  const applyTheme = (id: string) => {
    applyAppTheme(id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch { /* ignore */ }
  };

  const selectTheme = (id: string) => {
    setThemeColor(id);
    applyTheme(id);
    setShowColorModal(false);
    showMsg(t(lang, "settings_color_saved"));
  };

  const setTicketsFilterPersist = (v: "img" | "pdf") => {
    setTicketsFilter(v);
    try {
      localStorage.setItem(TICKETS_FILTER_KEY, v);
    } catch { /* ignore */ }
  };

  const submitPassword = () => {
    if (!currentPassword || !newPassword) {
      showMsg(t(lang, "settings_password_required"), true);
      return;
    }
    if (newPassword.length < 4) {
      showMsg(t(lang, "us_password_length"), true);
      return;
    }
    if (newPassword !== confirmPassword) {
      showMsg(t(lang, "settings_password_mismatch"), true);
      return;
    }
    changePasswordMut.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setShowPasswordModal(false);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          showMsg(t(lang, "settings_password_ok"));
        },
        onError: (err) => showMsg(err.message || t(lang, "settings_password_error"), true),
      }
    );
  };

  const toggleFingerprint = async () => {
    if (fingerprintEnabled) {
      setFingerprintEnabled(false);
      try {
        localStorage.setItem(FP_KEY, "0");
        localStorage.removeItem("bv_webauthn_cred");
        localStorage.removeItem("bv_fp_token");
        localStorage.removeItem("bv_fp_session");
      } catch { /* ignore */ }
      try { clearFpMut.mutate(); } catch { /* ignore */ }
      showMsg(t(lang, "settings_fingerprint_off"));
      return;
    }

    if (!webAuthnSupported) {
      showMsg(t(lang, "settings_fingerprint_unsupported"), true);
      return;
    }

    try {
      // Registro WebAuthn básico (credencial de plataforma / biometría del dispositivo)
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const userId = new TextEncoder().encode(String(user.id));
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Banca Victoria", id: window.location.hostname },
          user: {
            id: userId,
            name: user.username || user.name,
            displayName: user.name,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        showMsg(t(lang, "settings_fingerprint_cancelled"), true);
        return;
      }

      // Guardamos un identificador local (la autenticación real en login se puede ampliar después)
      const rawId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      localStorage.setItem("bv_webauthn_cred", rawId);
      localStorage.setItem(FP_KEY, "1");
      // Token de dispositivo (el servidor lo valida al entrar con huella)
      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      const deviceToken = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      try {
        localStorage.setItem("bv_fp_token", deviceToken);
        localStorage.setItem("bv_fp_session", JSON.stringify({
          id: user.id,
          bankNumber: user.bankNumber,
          name: user.name,
          username: user.username,
          role: user.role,
          credit: user.credit,
          commission: user.commission,
          groupId: user.groupId,
          language: user.language || "es",
        }));
        localStorage.setItem("bv_fp_username", user.username || user.name);
      } catch { /* ignore */ }
      registerFpMut.mutate({ token: deviceToken });
      setFingerprintEnabled(true);
      showMsg(t(lang, "settings_fingerprint_on"));
    } catch (err: any) {
      const msg = err?.name === "NotAllowedError"
        ? t(lang, "settings_fingerprint_cancelled")
        : t(lang, "settings_fingerprint_error");
      showMsg(msg, true);
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-900">{t(lang, "settings_title")}</h2>
      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm text-center text-white ${msgError ? "bg-red-600" : "bg-[var(--bv-primary)]"}`}>
          {msg}
        </div>
      )}

      {/* Notificaciones */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setNotifOpen(!notifOpen)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <Bell size={20} className="text-[var(--bv-primary)]" />
            <span className="text-sm font-semibold text-gray-900">{t(lang, "settings_notifications")}</span>
          </div>
          {notifOpen ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
        </button>
        {notifOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
            <label className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{t(lang, "settings_notif_enable")}</span>
              <input type="checkbox" checked={notifications.enabled} onChange={() => toggleNotif("enabled")} className="w-5 h-5 accent-green-600" />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{t(lang, "settings_notif_winning")}</span>
              <input type="checkbox" checked={notifications.winningTickets} onChange={() => toggleNotif("winningTickets")} className="w-5 h-5 accent-green-600" disabled={!notifications.enabled} />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{t(lang, "settings_notif_sale_credit")}</span>
              <input type="checkbox" checked={notifications.saleCreditPayment} onChange={() => toggleNotif("saleCreditPayment")} className="w-5 h-5 accent-green-600" disabled={!notifications.enabled} />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{t(lang, "settings_notif_prize")}</span>
              <input type="checkbox" checked={notifications.prizePayment} onChange={() => toggleNotif("prizePayment")} className="w-5 h-5 accent-green-600" disabled={!notifications.enabled} />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{t(lang, "settings_notif_update")}</span>
              <input type="checkbox" checked={notifications.updateAvailable} onChange={() => toggleNotif("updateAvailable")} className="w-5 h-5 accent-green-600" disabled={!notifications.enabled} />
            </label>
          </div>
        )}
      </div>

      {/* Opciones generales */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        <button className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50" onClick={() => setShowColorModal(true)}>
          <div className="flex items-center gap-3">
            <Palette size={20} className="text-[var(--bv-primary)]" />
            <span className="text-sm font-medium text-gray-900">{t(lang, "settings_change_color")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full border border-gray-200" style={{ background: THEME_COLORS.find((c) => c.id === themeColor)?.from || "#16a34a" }} />
            <ChevronRight size={18} className="text-gray-400" />
          </div>
        </button>
        <button className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50" onClick={() => showMsg(t(lang, "settings_icon_hint"))}>
          <div className="flex items-center gap-3">
            <Image size={20} className="text-[var(--bv-primary)]" />
            <span className="text-sm font-medium text-gray-900">{t(lang, "settings_change_icon")}</span>
          </div>
          <ChevronRight size={18} className="text-gray-400" />
        </button>
        <button className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50" onClick={() => setShowPasswordModal(true)}>
          <div className="flex items-center gap-3">
            <Lock size={20} className="text-[var(--bv-primary)]" />
            <span className="text-sm font-medium text-gray-900">{t(lang, "settings_change_password")}</span>
          </div>
          <ChevronRight size={18} className="text-gray-400" />
        </button>
        <button className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50" onClick={toggleFingerprint}>
          <div className="flex items-center gap-3">
            <Fingerprint size={20} className="text-[var(--bv-primary)]" />
            <div>
              <span className="text-sm font-medium text-gray-900 block">{t(lang, "settings_fingerprint")}</span>
              {!webAuthnSupported && (
                <span className="text-[10px] text-gray-400">{t(lang, "settings_fingerprint_unsupported")}</span>
              )}
            </div>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors ${fingerprintEnabled ? "bg-[var(--bv-primary-light)]0" : "bg-gray-300"} relative`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${fingerprintEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </div>
        </button>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Ticket size={20} className="text-[var(--bv-primary)]" />
            <span className="text-sm font-medium text-gray-900">{t(lang, "settings_tickets_filter")}</span>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setTicketsFilterPersist("img")}
              className={`px-3 py-1 rounded-md text-xs font-bold ${ticketsFilter === "img" ? "bg-white text-[var(--bv-primary-dark)] shadow-sm" : "text-gray-500"}`}
            >
              {t(lang, "settings_tickets_open")}
            </button>
            <button
              onClick={() => setTicketsFilterPersist("pdf")}
              className={`px-3 py-1 rounded-md text-xs font-bold ${ticketsFilter === "pdf" ? "bg-white text-[var(--bv-primary-dark)] shadow-sm" : "text-gray-500"}`}
            >
              {t(lang, "settings_tickets_closed")}
            </button>
          </div>
        </div>
      </div>

      {/* Idioma */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 mb-3">
          <Globe size={20} className="text-[var(--bv-primary)]" />
          <span className="text-sm font-semibold text-gray-900">{t(lang, "settings_language")}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => changeLanguage(l)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                lang === l ? "bg-[var(--bv-primary-light)] border-[var(--bv-primary)] text-green-800" : "bg-white border-gray-200 text-gray-600 hover:border-[var(--bv-primary-soft)]"
              }`}
            >
              {lang === l && <Check size={14} className="inline mr-1" />}
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Modal cambio de color */}
      {showColorModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-900">{t(lang, "settings_change_color")}</h3>
              <button onClick={() => setShowColorModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {THEME_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectTheme(c.id)}
                  className={`aspect-square rounded-xl border-2 ${themeColor === c.id ? "border-gray-900 scale-105" : "border-transparent"}`}
                  style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal cambio de contraseña */}
      {showPasswordModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-900">{t(lang, "settings_change_password")}</h3>
              <button onClick={() => setShowPasswordModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "settings_current_password")}</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "settings_new_password")}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-600 mb-1 block">{t(lang, "settings_confirm_password")}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--bv-primary-soft)] rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowPasswordModal(false)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm">
                {t(lang, "rg_cancel")}
              </button>
              <button
                onClick={submitPassword}
                disabled={changePasswordMut.isPending}
                className="flex-1 py-3 rounded-xl bg-[var(--bv-primary)] text-white font-bold text-sm hover:bg-[var(--bv-primary-dark)] disabled:opacity-50"
              >
                {t(lang, "rg_confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
