import {
  X, ShoppingCart, BarChart3, Receipt, Trophy,
  Users, LogOut, ShieldCheck, Download, Upload, Globe, Settings
} from "lucide-react";
import type { SessionUser } from "@/store"
import { formatMoney } from "@/store";
import { downloadDataFile, importDataFile } from "@/lib/sync-file";
import { trpc } from "@/providers/trpc";
import { LANG_NAMES, t, type Lang } from "@/i18n";

interface SideMenuProps {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
  onLanguageChange: (lang: Lang) => void;
}

const MENU_ITEMS = [
  { id: "vender", key: "nav_vender", icon: ShoppingCart },
  { id: "balance", key: "nav_balance", icon: BarChart3 },
  { id: "reportes", key: "nav_ventas", icon: Receipt },
  { id: "tickets", key: "nav_tickets", icon: Receipt },
  { id: "sorteos", key: "nav_sorteos", icon: Trophy },
  { id: "settings", key: "nav_settings", icon: Settings },
];

const ADMIN_ITEMS = [
  { id: "admin", key: "nav_admin", icon: ShieldCheck },
];

export default function SideMenu({ open, onClose, user, onNavigate, onLogout, onLanguageChange }: SideMenuProps) {
  const setLanguageMut = trpc.lotteryUser.setLanguage.useMutation();
  const currentLang: Lang = user.language || "es";
  const changeLanguage = (lang: Lang) => {
    if (lang === currentLang) return;
    setLanguageMut.mutate({ language: lang });
    onLanguageChange(lang);
  };
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="absolute inset-0 z-50 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute left-0 top-0 bottom-0 w-72 z-50 bg-white shadow-2xl flex flex-col animate-in slide-in-from-left-200">
        {/* Header */}
        <div className="bg-gradient-to-br from-[var(--bv-primary)] to-green-800 p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Users size={20} className="text-white" />
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X size={20} />
            </button>
          </div>
          <h3 className="font-bold text-base">{user.name}</h3>
          <p className="text-green-200 text-xs mt-0.5">Banca: {user.bankNumber}</p>
          <p className="text-green-200 text-xs capitalize">{user.role}</p>
          {user.role === "user" && <p className="text-green-100 text-sm font-bold mt-2">${formatMoney(user.credit)}</p>}
        </div>

        {/* Menu Items */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {MENU_ITEMS.filter((item) => user.role === "user" || (item.id !== "vender" && item.id !== "balance" && item.id !== "tickets")).map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="w-full flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-[var(--bv-primary-light)] transition-colors text-left"
            >
              <item.icon size={20} className="text-[var(--bv-primary)]" />
              <span className="text-sm font-medium">{t(currentLang, item.key)}</span>
            </button>
          ))}

          {(user.role === "admin" || user.role === "supervisor" || user.role === "collector") && (
            <>
              <div className="mx-5 my-2 border-t border-gray-100" />
              {ADMIN_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-[var(--bv-primary-light)] transition-colors text-left"
                >
                  <item.icon size={20} className="text-[var(--bv-primary)]" />
                  <span className="text-sm font-medium">{user.role === "collector" ? t(currentLang, "nav_cobros") : t(currentLang, item.key)}</span>
                </button>
              ))}
            </>
          )}

          {user.role === "admin" && (
            <>
              <div className="mx-5 my-2 border-t border-gray-100" />
              <button
                onClick={() => downloadDataFile(user.name)}
                className="w-full flex items-center gap-3 px-5 py-3 text-blue-600 hover:bg-blue-50 transition-colors text-left"
              >
                <Download size={20} />
                <span className="text-sm font-medium">Exportar mis datos</span>
              </button>

              <label className="w-full flex items-center gap-3 px-5 py-3 text-orange-600 hover:bg-orange-50 transition-colors text-left cursor-pointer">
                <Upload size={20} />
                <span className="text-sm font-medium">Importar datos</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const text = String(ev.target?.result || "");
                      const result = importDataFile(text);
                      alert(result.message);
                      window.location.reload();
                    };
                    reader.readAsText(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          )}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut size={20} />
            <span className="text-sm font-medium">{t(currentLang, "nav_logout")}</span>
          </button>
        </div>
      </div>
    </>
  );
}
