import { ShoppingCart, BarChart3, Receipt, Trophy } from "lucide-react";
import { t } from "@/i18n";
import type { Lang } from "@/i18n";

interface BottomNavProps {
  active: string;
  onNavigate: (screen: string) => void;
  userRole: string;
  language?: Lang;
}

const NAV_ITEMS = [
  { id: "vender", key: "nav_vender", icon: ShoppingCart },
  { id: "balance", key: "nav_balance", icon: BarChart3 },
  { id: "tickets", key: "nav_tickets", icon: Receipt },
  { id: "sorteos", key: "nav_sorteos", icon: Trophy },
];

export default function BottomNav({ active, onNavigate, userRole, language }: BottomNavProps) {
  const items = userRole === "user" ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.id !== "vender" && item.id !== "balance" && item.id !== "tickets");
  return (
    <nav className="shrink-0 h-16 bg-white border-t border-green-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] flex items-center justify-around px-2 z-40">
      {items.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${
              isActive
                ? "bg-[var(--bv-primary-light)] text-[var(--bv-primary-dark)] scale-105"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <item.icon
              size={22}
              className={isActive ? "text-[var(--bv-primary)]" : "text-gray-400"}
              strokeWidth={isActive ? 2.5 : 1.5}
            />
            <span className={`text-[10px] font-medium ${isActive ? "text-[var(--bv-primary-dark)]" : ""}`}>
              {t(language, item.key)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
