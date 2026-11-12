import { useState, useMemo } from "react";
import type { SessionUser } from "@/store"
import { formatMoney } from "@/store";
import { Calendar, Filter, BarChart3, Receipt, DollarSign, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { t } from "@/i18n";

interface ReportesScreenProps {
  user: SessionUser;
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inDateRange(value: any, from: string, to: string): boolean {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  const fromMs = new Date(from + "T00:00:00").getTime();
  const toMs = new Date(to + "T00:00:00").getTime() + 24 * 60 * 60 * 1000;
  return t >= fromMs && t < toMs;
}

export default function ReportesScreen({ user }: ReportesScreenProps) {
  const lang = user.language || "es";
  const isAdmin = user.role === "admin";
  const isManager = ["admin", "supervisor", "collector"].includes(user.role);
  const today = todayStr();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const isToday = fromDate === today && toDate === today;
  const [filterGroupId, setFilterGroupId] = useState<string>("");
  const [filterUserId, setFilterUserId] = useState<string>("");

  const ticketQuery = trpc.ticket.list.useQuery(isManager ? undefined : { userId: user.id });
  const userQuery = trpc.lotteryUser.list.useQuery(undefined, { enabled: isManager });
  const groupQuery = trpc.group.list.useQuery(undefined, { enabled: isAdmin });
  const summaryQuery = trpc.lotteryUser.creditSummary.useQuery({ from: fromDate, to: toDate });

  const allTickets = ticketQuery.data || [];
  const allUsersRaw = userQuery.data || [];
  const allUsers = allUsersRaw.filter((u: any) => u.role === "user");
  const groups = groupQuery.data || [];
  const summary = summaryQuery.data;
  const rows = summary?.rows || [];

  // Scope: admin can filter by group/user; supervisor/collector already limited by API to their group
  const scopedUsers = useMemo(() => {
    let list = allUsers;
    if (filterGroupId) list = list.filter((u: any) => String(u.groupId) === filterGroupId);
    if (filterUserId) list = list.filter((u: any) => String(u.id) === filterUserId);
    return list;
  }, [allUsers, filterGroupId, filterUserId]);

  const scopedUserIds = useMemo(() => new Set(scopedUsers.map((u: any) => u.id)), [scopedUsers]);

  const ticketsInRange = allTickets.filter((t: any) => {
    if (t.status === "cancelled") return false;
    if (!inDateRange(t.createdAt, fromDate, toDate)) return false;
    if (!isManager) return t.userId === user.id;
    if (filterGroupId || filterUserId) return scopedUserIds.has(t.userId);
    return true;
  });

  // Metrics
  const ventas = ticketsInRange.reduce((sum: number, t: any) => sum + Number(t.total), 0);
  const comisiones = ticketsInRange.reduce((sum: number, t: any) => {
    const total = Number(t.total) || 0;
    const net = Number(t.netDeduction) || 0;
    return sum + Math.max(0, total - net);
  }, 0);

  const rowsScoped = rows.filter((r: any) => {
    if (!isManager) return r.userId === user.id;
    if (filterGroupId || filterUserId) return scopedUserIds.has(r.userId);
    return true;
  });

  const premiosPagados = rowsScoped
    .filter((r: any) => r.type === "payout")
    .reduce((s: number, r: any) => s + Number(r.amount), 0);

  const cobroVentas = rowsScoped
    .filter((r: any) => r.type === "deposit")
    .reduce((s: number, r: any) => s + Number(r.amount), 0);

  // Ganancia/pérdida aproximada del periodo:
  // neto contable = cobros de venta - premios pagados (ajustes de crédito)
  // + comisiones retenidas como referencia
  const totalPerdidaGanancia = cobroVentas - premiosPagados;
  // Alternativa más completa: ventas netas - premios
  const netaVentas = ticketsInRange.reduce((sum: number, t: any) => sum + Number(t.netDeduction), 0);
  const resultadoOperativo = netaVentas - premiosPagados;

  const resetToToday = () => { setFromDate(today); setToDate(today); };

  const typeLabels: Record<string, string> = {
    deposit: t(lang, "ventas_type_deposit"),
    payout: t(lang, "ventas_type_payout"),
    reversal: t(lang, "ventas_type_reversal"),
    correction: t(lang, "ventas_type_correction"),
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-900">{t(lang, "ventas_title")}</h2>

      {/* Filtro de fecha */}
      <div className="bg-white rounded-xl border border-green-100 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={14} className="text-[var(--bv-primary)]" />
          <span className="text-xs font-bold text-[var(--bv-primary-dark)]">{isToday ? t(lang, "balance_today") : t(lang, "balance_date_search")}</span>
        </div>
        <div className="flex gap-2">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs" />
          {!isToday && <button onClick={resetToToday} className="px-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold">{t(lang, "balance_today_btn")}</button>}
        </div>

        {/* Admin: filtros por grupo y usuario */}
        {isAdmin && (
          <div className="flex gap-2 mt-2">
            <select
              value={filterGroupId}
              onChange={(e) => { setFilterGroupId(e.target.value); setFilterUserId(""); }}
              className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs"
            >
              <option value="">{t(lang, "report_all_system")}</option>
              {groups.map((g: any) => (
                <option key={g.id} value={g.id}>{t(lang, "report_by_group")}: {g.name}</option>
              ))}
            </select>
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs"
            >
              <option value="">{t(lang, "report_by_user")}</option>
              {(filterGroupId ? allUsers.filter((u: any) => String(u.groupId) === filterGroupId) : allUsers).map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Cuentas administrativas reorganizadas */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded-xl border border-blue-100 p-3 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <Receipt size={14} className="text-blue-600" />
            <p className="text-[10px] font-medium text-gray-500">{t(lang, "report_sales")}</p>
          </div>
          <p className="text-lg font-bold text-gray-900">${formatMoney(ventas)}</p>
          <p className="text-[10px] text-gray-500">{ticketsInRange.length} {t(lang, "ventas_tickets")}</p>
        </div>

        <div className="bg-white rounded-xl border border-purple-100 p-3 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <PercentIcon />
            <p className="text-[10px] font-medium text-gray-500">{t(lang, "report_commissions")}</p>
          </div>
          <p className="text-lg font-bold text-purple-700">${formatMoney(comisiones)}</p>
        </div>

        <div className="bg-red-50 rounded-xl border border-red-100 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign size={14} className="text-red-600" />
            <p className="text-[10px] font-medium text-red-600">{t(lang, "report_prizes_paid")}</p>
          </div>
          <p className="text-base font-bold text-red-700">${formatMoney(premiosPagados)}</p>
        </div>

        <div className="bg-[var(--bv-primary-light)] rounded-xl border border-green-100 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={14} className="text-[var(--bv-primary)]" />
            <p className="text-[10px] font-medium text-[var(--bv-primary-dark)]">{t(lang, "report_sales_collection")}</p>
          </div>
          <p className="text-base font-bold text-[var(--bv-primary-dark)]">${formatMoney(cobroVentas)}</p>
        </div>
      </div>

      {/* Total pérdida / ganancia */}
      <div className={`rounded-xl border p-4 shadow-sm ${resultadoOperativo >= 0 ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100"}`}>
        <div className="flex items-center gap-2 mb-1">
          {resultadoOperativo >= 0 ? <TrendingUp size={18} className="text-blue-600" /> : <TrendingDown size={18} className="text-orange-600" />}
          <p className="text-sm font-bold text-gray-800">{t(lang, "report_profit_loss")}</p>
        </div>
        <p className={`text-2xl font-extrabold ${resultadoOperativo >= 0 ? "text-blue-700" : "text-orange-700"}`}>
          ${formatMoney(resultadoOperativo)}
        </p>
        <p className="text-[11px] text-gray-500 mt-1">
          {t(lang, "report_sales")} netas ${formatMoney(netaVentas)} − {t(lang, "report_prizes_paid")} ${formatMoney(premiosPagados)}
        </p>
      </div>

      {/* Actividad por vendedor (cuentas administrativas) */}
      {isManager && (
        <div>
          <h3 className="text-sm font-bold text-gray-900 mb-2">{t(lang, "ventas_activity_by_seller")}</h3>
          <div className="space-y-2">
            {scopedUsers.map((u: any) => {
              const uTickets = ticketsInRange.filter((t: any) => t.userId === u.id);
              const uSales = uTickets.reduce((sum: number, t: any) => sum + Number(t.total), 0);
              const uComm = uTickets.reduce((sum: number, t: any) => sum + Math.max(0, Number(t.total) - Number(t.netDeduction)), 0);
              const uRows = rowsScoped.filter((r: any) => r.userId === u.id);
              const uCobro = uRows.filter((r: any) => r.type === "deposit").reduce((s: number, r: any) => s + Number(r.amount), 0);
              const uPremios = uRows.filter((r: any) => r.type === "payout").reduce((s: number, r: any) => s + Number(r.amount), 0);
              if (uTickets.length === 0 && uRows.length === 0) return null;
              return (
                <div key={u.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                  <p className="text-sm font-bold text-gray-900 mb-2">
                    {u.name} <span className="text-[10px] font-normal text-gray-400">({u.bankNumber})</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-blue-50 rounded p-1.5">
                      <p className="text-xs font-bold text-blue-700">${formatMoney(uSales)}</p>
                      <p className="text-[8px] text-gray-500">{t(lang, "report_sales")}</p>
                    </div>
                    <div className="bg-purple-50 rounded p-1.5">
                      <p className="text-xs font-bold text-purple-700">${formatMoney(uComm)}</p>
                      <p className="text-[8px] text-gray-500">{t(lang, "report_commissions")}</p>
                    </div>
                    <div className="bg-[var(--bv-primary-light)] rounded p-1.5">
                      <p className="text-xs font-bold text-[var(--bv-primary-dark)]">${formatMoney(uCobro)}</p>
                      <p className="text-[8px] text-gray-500">{t(lang, "report_sales_collection")}</p>
                    </div>
                    <div className="bg-red-50 rounded p-1.5">
                      <p className="text-xs font-bold text-red-600">${formatMoney(uPremios)}</p>
                      <p className="text-[8px] text-gray-500">{t(lang, "report_prizes_paid")}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {scopedUsers.every((u: any) =>
              ticketsInRange.filter((t: any) => t.userId === u.id).length === 0 &&
              rowsScoped.filter((r: any) => r.userId === u.id).length === 0
            ) && (
              <p className="text-sm text-gray-400 text-center py-4">{t(lang, "ventas_no_activity")}</p>
            )}
          </div>
        </div>
      )}

      {/* Movimientos de credito */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">{t(lang, "ventas_credit_movements")}</h3>
        <div className="space-y-2">
          {rowsScoped.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t(lang, "ventas_no_movements")}</p>}
          {rowsScoped.map((r: any) => (
            <div key={r.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg text-xs">
              <span className={`px-2 py-0.5 rounded-full font-bold shrink-0 ${r.direction === "subtract" ? "bg-red-100 text-red-700" : "bg-green-100 text-[var(--bv-primary-dark)]"}`}>
                {typeLabels[r.type] || r.type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{r.note || "-"}</p>
                <p className="text-gray-400 flex items-center gap-1"><Calendar size={10} /> {new Date(r.createdAt).toLocaleString()}</p>
              </div>
              <span className={`font-bold shrink-0 ${r.direction === "subtract" ? "text-red-600" : "text-[var(--bv-primary-dark)]"}`}>
                {r.direction === "subtract" ? "-" : "+"}${formatMoney(r.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PercentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}
