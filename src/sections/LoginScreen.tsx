import { useState, useEffect } from "react";
import { saveSession } from "@/store";
import type { SessionUser } from "@/store";
import { trpc } from "@/providers/trpc";
import { Eye, EyeOff, WifiOff, Fingerprint } from "lucide-react";
import { t, LANG_NAMES, type Lang } from "@/i18n";

interface LoginScreenProps {
  onLogin: (user: SessionUser) => void;
}


function getOrCreateDeviceId(): { id: string; label: string } {
  try {
    let id = localStorage.getItem("bv_device_id");
    if (!id) {
      id = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem("bv_device_id", id);
    }
    const label = typeof navigator !== "undefined"
      ? `${navigator.platform || "web"} · ${(navigator.userAgent || "").slice(0, 40)}`
      : "web";
    return { id, label };
  } catch {
    return { id: `tmp-${Date.now()}`, label: "web" };
  }
}

function detectBrowserLang(): Lang {
  const nav = (navigator.language || "es").slice(0, 2);
  if (nav === "fr" || nav === "en") return nav;
  return "es";
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [lang, setLang] = useState<Lang>(detectBrowserLang());
  const [fpAvailable, setFpAvailable] = useState(false);
  const [fpLoading, setFpLoading] = useState(false);

  // ¿Hay huella registrada en este dispositivo?
  useEffect(() => {
    try {
      const enabled = localStorage.getItem("bv_fingerprint") === "1";
      const cred = localStorage.getItem("bv_webauthn_cred");
      const session = localStorage.getItem("bv_fp_session");
      const token = localStorage.getItem("bv_fp_token");
      const supported =
        typeof window !== "undefined" &&
        !!window.PublicKeyCredential &&
        typeof navigator.credentials?.get === "function";
      setFpAvailable(!!(enabled && cred && session && token && supported));
    } catch {
      setFpAvailable(false);
    }
  }, []);

  const loginMut = trpc.lotteryUser.login.useMutation({
    onSuccess: (data) => {
      if (data.success && data.user) {
        const user: SessionUser = {
          id: data.user.id,
          bankNumber: data.user.bankNumber,
          name: data.user.name,
          username: data.user.username,
          role: data.user.role as "admin" | "supervisor" | "collector" | "user",
          credit: String(data.user.credit),
          commission: String(data.user.commission || "0"),
          groupId: data.user.groupId,
          language: (data.user.language as "es" | "fr" | "en") || "es",
        };
        saveSession(user);
        // Si la huella esta activa, guardar sesion para próximo login biométrico
        try {
          if (localStorage.getItem("bv_fingerprint") === "1") {
            localStorage.setItem("bv_fp_session", JSON.stringify(user));
            localStorage.setItem("bv_fp_username", user.username || "");
          }
        } catch { /* ignore */ }
        onLogin(user);
      } else {
        setError(data.error || t(lang, "login_error_invalid"));
        setLoading(false);
      }
    },
    onError: (err) => {
      setError(err.message || t(lang, "login_error_connection"));
      setLoading(false);
    },
  });


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError(t(lang, "login_error_required"));
      return;
    }

    setLoading(true);
    const dev = getOrCreateDeviceId();
    loginMut.mutate({
      username: username.trim(),
      password: password.trim(),
      deviceId: dev.id,
      deviceLabel: dev.label,
    });
  };


  const fpLoginMut = trpc.lotteryUser.fingerprintLogin.useMutation();

  const loginWithFingerprint = async () => {
    setError("");
    setFpLoading(true);
    try {
      const rawIdB64 = localStorage.getItem("bv_webauthn_cred");
      const sessionRaw = localStorage.getItem("bv_fp_session");
      const deviceToken = localStorage.getItem("bv_fp_token");
      if (!rawIdB64 || !sessionRaw || !deviceToken) {
        setError("Huella no configurada. Inicie sesion y active la huella en Configuracion.");
        setFpLoading(false);
        return;
      }
      const binary = atob(rawIdB64);
      const idBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) idBytes[i] = binary.charCodeAt(i);

      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: idBytes, type: "public-key", transports: ["internal"] }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      if (!assertion) {
        setError("No se pudo verificar la huella");
        setFpLoading(false);
        return;
      }

      const cached = JSON.parse(sessionRaw) as SessionUser;
      const data = await fpLoginMut.mutateAsync({ userId: cached.id, token: deviceToken });
      if (!data.success || !data.user) {
        setError(data.error || "No se pudo iniciar sesion con huella");
        setFpLoading(false);
        return;
      }
      const user: SessionUser = {
        id: data.user.id,
        bankNumber: data.user.bankNumber,
        name: data.user.name,
        username: data.user.username,
        role: data.user.role as SessionUser["role"],
        credit: String(data.user.credit),
        commission: String(data.user.commission || "0"),
        groupId: data.user.groupId,
        language: (data.user.language as "es" | "fr" | "en") || "es",
      };
      saveSession(user);
      try { localStorage.setItem("bv_fp_session", JSON.stringify(user)); } catch { /* ignore */ }
      onLogin(user);
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        setError("Huella cancelada o no reconocida");
      } else {
        setError(err?.message || "Error de huella. Use usuario y contrasena.");
      }
    } finally {
      setFpLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[var(--bv-primary)] via-green-700 to-green-800 p-4">
      <div className="mb-8 text-center">
        <div className="w-24 h-24 mx-auto bg-white rounded-2xl flex items-center justify-center shadow-2xl mb-4 overflow-hidden p-1">
          <img src="/logo-victoria.png" alt="Banca Victoria" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">BANCA VICTORIA</h1>
        <p className="text-green-200 text-sm mt-1">{t(lang, "login_tagline")}</p>
      </div>

      <div className="flex gap-1.5 mb-4">
        {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${lang === l ? "bg-white text-[var(--bv-primary-dark)]" : "bg-white/20 text-white hover:bg-white/30"}`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="w-full max-w-sm bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20">
        <h2 className="text-xl font-bold text-white text-center mb-5">
          {offlineMode ? (
            <span className="flex items-center justify-center gap-2">
              <WifiOff size={18} /> {t(lang, "login_offline_mode")}
            </span>
          ) : (
            t(lang, "login_title")
          )}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-green-100 text-sm font-medium mb-1.5">{t(lang, "login_username")}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-green-200/70 focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white/30 transition-all"
              placeholder={t(lang, "login_username_placeholder")}
              autoCapitalize="none"
            />
          </div>

          <div>
            <label className="block text-green-100 text-sm font-medium mb-1.5">{t(lang, "login_password")}</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-white/20 border border-white/30 text-white placeholder-green-200/70 focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white/30 transition-all"
                placeholder={t(lang, "login_password_placeholder")}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-green-200 hover:text-white transition-colors"
              >
                {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-400/40 rounded-lg px-3 py-2 text-red-100 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-white text-[var(--bv-primary-dark)] font-bold text-base hover:bg-[var(--bv-primary-light)] active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? t(lang, "login_connecting") : t(lang, "login_submit")}
          </button>

          {fpAvailable && (
            <>
              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-white/20" />
                <span className="text-green-100/70 text-xs">o</span>
                <div className="flex-1 h-px bg-white/20" />
              </div>
              <button
                type="button"
                onClick={loginWithFingerprint}
                disabled={fpLoading || loading}
                className="w-full py-3.5 rounded-xl bg-white/15 border border-white/40 text-white font-bold text-base hover:bg-white/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Fingerprint size={22} />
                {fpLoading ? "Verificando..." : "Entrar con huella"}
              </button>
            </>
          )}
        </form>

      </div>

      <p className="text-green-200/40 text-xs mt-6 text-center">Banca Victoria v3.0</p>
    </div>
  );
}
