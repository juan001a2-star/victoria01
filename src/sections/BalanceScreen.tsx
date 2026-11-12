import { useState } from "react";
import type { SessionUser } from "@/store"
import { formatMoney } from "@/store";
import { trpc } from "@/providers/trpc";
import { Receipt, Filter } from "lucide-react";
import { t } from "@/i18n";

interface BalanceScreenProps {
  user: SessionUser;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inDateRange(value: any, from: string, to: string): boolean {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  const fromMs = new Date(from + "T00:00:00").getTime();
  const toMs = new Date(to + "T00:00:00").getTime() + 24 * 60 * 60 * 1000;
  return t >= fromMs && t < toMs;
}

function drawDateOf(value: any): string {
  const d = new Date(value);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export default function BalanceScreen({ user }: BalanceScreenProps) {
  const lang = user.language || "es";
  const today = todayStr();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const isToday = fromDate === today && toDate === today;

  const userQuery = trpc.lotteryUser.byId.useQuery({ id: user.id }, { refetchInterval: 10000 });
  const ticketQuery = trpc.ticket.list.useQuery({ userId: user.id });
  const creditHistoryQuery = trpc.lotteryUser.creditHistory.useQuery({ userId: user.id });
  const winnerListQuery = trpc.winner.list.useQuery();

  const allTickets = ticketQuery.data || [];
  const allHistory = creditHistoryQuery.data || [];
  const winnerResults = winnerListQuery.data || [];
  const currentCredit = Number(userQuery.data?.credit ?? user.credit);
  const commissionPct = Number(userQuery.data?.commission ?? 0);

  const ticketsInRange = allTickets.filter((t: any) => inDateRange(t.createdAt, fromDate, toDate));
  const historyInRange = allHistory.filter((h: any) => inDateRange(h.createdAt, fromDate, toDate));

  const activos: any[] = [];
  const perdedores: any[] = [];
  const ganadores: any[] = [];
  const anulados: any[] = [];
  for (const t of ticketsInRange) {
    if (t.status === "cancelled") anulados.push(t);
    else if (t.status === "winner") ganadores.push(t);
    else {
      const drawHappened = winnerResults.some((w: any) => w.lotteryId === t.lotteryId && w.drawDate === drawDateOf(t.createdAt));
      if (drawHappened) perdedores.push(t);
      else activos.push(t);
    }
  }

  const ticketsActivos = ticketsInRange.filter((t: any) => t.status !== "cancelled");
  const ventaDelDia = ticketsActivos.reduce((sum: number, t: any) => sum + Number(t.total), 0);
  const comisionMonto = ventaDelDia * (commissionPct / 100);
  // Venta neta = lo que se RESTA del crédito al vender
  const ventaNeta = ventaDelDia - comisionMonto;

  // Premios generados (informativo): prizeAmount en tickets ganadores
  const premiosGenerados = ticketsInRange
    .filter((t: any) => t.status === "winner" || Number(t.prizeAmount) > 0)
    .reduce((sum: number, t: any) => sum + Number(t.prizeAmount || 0), 0);

  // Movimientos de crédito del periodo
  let pagoPremios = 0;        // −  se restó crédito (pagó premio al cliente)
  let creditosPremios = 0;    // +  se sumó crédito (premio acreditado al vendedor)
  let pagoCreditoVenta = 0;   // +  liquidó / entregó dinero de ventas
  let otrosAdd = 0;
  let otrosSub = 0;
  for (const h of historyInRange) {
    const amt = Number(h.amount);
    if (h.type === "payout") {
      if (h.direction === "subtract") pagoPremios += amt;
      else creditosPremios += amt;
    } else if (h.type === "reversal") {
      creditosPremios -= amt;
    } else if (h.type === "deposit") {
      pagoCreditoVenta += amt;
    } else if (h.direction === "add") {
      otrosAdd += amt;
    } else if (h.direction === "subtract") {
      otrosSub += amt;
    }
  }

  // Balance inicial = crédito actual + lo que se restó por ventas − movimientos netos del historial
  // (las ventas no están en credit_adjustments; se deducen del crédito al crear el ticket)
  const movimientosNetos = creditosPremios - pagoPremios + pagoCreditoVenta + otrosAdd - otrosSub;
  const balanceInicial = currentCredit + ventaNeta - movimientosNetos;

  // Lógica de movimientos (la correcta para la banca):
  // Balance actual = Balance inicial − Venta neta + Premios − Pago de premios + Pago crédito venta (+/− otros)
  const balanceCalculado =
    balanceInicial - ventaNeta + creditosPremios - pagoPremios + pagoCreditoVenta + otrosAdd - otrosSub;

  // Liquidación del periodo
  // Pendiente = Venta neta − Crédito de premios − Pago de crédito de venta
  const pendiente = ventaNeta - creditosPremios - pagoCreditoVenta;
  const aCobrar = pendiente > 0 ? pendiente : 0;
  const aPagar = pendiente < 0 ? -pendiente : 0;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-900">{t(lang, "balance_title")}</h2>

      {/* Credit Card */}
      <div className="bg-gradient-to-br from-[var(--bv-primary)] to-[var(--bv-primary-dark)] rounded-2xl p-5 text-white shadow-lg">
        <p className="text-green-100 text-sm">{t(lang, "balance_credit_available")}</p>
        <p className="text-3xl font-extrabold mt-1">${formatMoney(currentCredit)}</p>
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/20">
          <div><p className="text-[10px] text-green-200">{t(lang, "balance_bank")}</p><p className="text-sm font-bold">{user.bankNumber}</p></div>
          <div><p className="text-[10px] text-green-200">{t(lang, "balance_user")}</p><p className="text-sm font-bold">{user.name}</p></div>
        </div>
      </div>

      {/* Filtro de fecha */}
      <div className="bg-white rounded-xl border border-green-100 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={14} className="text-[var(--bv-primary)]" />
          <span className="text-xs font-bold text-[var(--bv-primary-dark)]">{isToday ? t(lang, "balance_today") : t(lang, "balance_date_search")}</span>
        </div>
        <div className="flex gap-2">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="flex-1 px-2 py-1.5 border border-[var(--bv-primary-soft)] rounded-lg text-xs" />
          {!isToday && <button onClick={() => { setFromDate(today); setToDate(today); }} className="px-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold">{t(lang, "balance_today_btn")}</button>}
        </div>
      </div>

      {/* Contabilidad */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">{t(lang, "balance_accounting")}</h3>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">{t(lang, "balance_initial")}</span>
            <span className="font-medium text-gray-900">${formatMoney(balanceInicial)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">{t(lang, "balance_day_sales")}</span>
            <span className="font-medium text-gray-900">${formatMoney(ventaDelDia)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">{t(lang, "balance_commission_pct")}</span>
            <span className="font-medium text-gray-900">{commissionPct}%</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">{t(lang, "balance_commission_amount")}</span>
            <span className="font-medium text-gray-900">${formatMoney(comisionMonto)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">− {t(lang, "balance_net_sales")}</span>
            <span className="font-medium text-red-600">−${formatMoney(ventaNeta)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">{t(lang, "balance_prizes_generated")}</span>
            <span className="font-medium text-gray-900">${formatMoney(premiosGenerados)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">+ {t(lang, "balance_prize_credits")}</span>
            <span className="font-medium text-[var(--bv-primary)]">+${formatMoney(creditosPremios)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">− {t(lang, "balance_prizes_paid")}</span>
            <span className="font-medium text-red-600">−${formatMoney(pagoPremios)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">+ {t(lang, "balance_sale_payment")}</span>
            <span className="font-medium text-[var(--bv-primary)]">+${formatMoney(pagoCreditoVenta)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm bg-gray-50">
            <span className="text-gray-700 font-bold">{t(lang, "balance_result")}</span>
            <span className="font-bold text-[var(--bv-primary-dark)]">${formatMoney(currentCredit)}</span>
          </div>
          <div className="flex justify-between px-3 py-1.5 text-[10px] bg-gray-50 border-t border-gray-100">
            <span className="text-gray-400">Según movimientos: ${formatMoney(balanceCalculado)}</span>
            <span className={Math.abs(balanceCalculado - currentCredit) < 0.01 ? "text-green-500" : "text-orange-500"}>
              {Math.abs(balanceCalculado - currentCredit) < 0.01 ? "✓ Cuadra" : "⚠ Diferencia"}
            </span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">{t(lang, "balance_to_collect")}</span>
            <span className={`font-bold ${aCobrar > 0 ? "text-red-600" : "text-gray-400"}`}>${formatMoney(aCobrar)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-gray-500">{t(lang, "balance_to_pay")}</span>
            <span className={`font-bold ${aPagar > 0 ? "text-orange-600" : "text-gray-400"}`}>${formatMoney(aPagar)}</span>
          </div>
        </div>
      </div>

      {/* Tickets del dia */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">{isToday ? t(lang, "balance_tickets_today") : t(lang, "balance_tickets_period")}</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center shadow-sm"><p className="text-lg font-bold text-gray-900">{ticketsInRange.length}</p><p className="text-[9px] text-gray-500">{t(lang, "balance_total")}</p></div>
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-2.5 text-center"><p className="text-lg font-bold text-blue-700">{activos.length}</p><p className="text-[9px] text-blue-600">{t(lang, "balance_active")}</p></div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-100 p-2.5 text-center"><p className="text-lg font-bold text-yellow-700">{ganadores.length}</p><p className="text-[9px] text-yellow-600">{t(lang, "balance_winners")}</p></div>
          <div className="bg-gray-100 rounded-xl border border-gray-200 p-2.5 text-center"><p className="text-lg font-bold text-gray-600">{perdedores.length}</p><p className="text-[9px] text-gray-500">{t(lang, "balance_losers")}</p></div>
          <div className="bg-red-50 rounded-xl border border-red-100 p-2.5 text-center"><p className="text-lg font-bold text-red-600">{anulados.length}</p><p className="text-[9px] text-red-500">{t(lang, "balance_cancelled")}</p></div>
          <div className="bg-[var(--bv-primary-light)] rounded-xl border border-green-100 p-2.5 text-center"><p className="text-sm font-bold text-[var(--bv-primary-dark)]">${formatMoney(ventaDelDia)}</p><p className="text-[9px] text-[var(--bv-primary)]">{t(lang, "balance_sold")}</p></div>
        </div>
      </div>

      {/* Recent Tickets */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">{t(lang, "balance_tickets_period")}</h3>
        <div className="space-y-2">
          {ticketsInRange.length > 0 ? [...ticketsInRange].reverse().slice(0, 20).map((ticket: any) => (
            <div key={ticket.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm flex items-center justify-between">
              <div><p className="text-sm font-bold text-gray-900">{ticket.code}</p><p className="text-[10px] text-gray-500">{ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : "-"}</p></div>
              <div className="text-right">
                <p className="text-sm font-bold text-[var(--bv-primary-dark)]">${formatMoney(ticket.total)}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ticket.status === "active" ? "bg-green-100 text-[var(--bv-primary-dark)]" : ticket.status === "cancelled" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-700"}`}>{ticket.status}</span>
              </div>
            </div>
          )) : <p className="text-sm text-gray-400 text-center py-4">{t(lang, "balance_no_tickets_period")}</p>}
        </div>
      </div>

      {/* Historial de balance (credito agregado/descontado) */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">{t(lang, "balance_credit_movements")}</h3>
        <div className="space-y-2">
          {historyInRange.length > 0 ? historyInRange.map((h: any) => (
            <div key={h.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className={`text-sm font-bold ${h.direction === "subtract" ? "text-red-600" : "text-[var(--bv-primary)]"}`}>
                  {h.direction === "subtract" ? "-" : "+"}${formatMoney(h.amount)}
                </p>
                <p className="text-[10px] text-gray-500">{new Date(h.createdAt).toLocaleString()}</p>
              </div>
              {h.note && <p className="text-[10px] text-gray-400">{h.note}</p>}
            </div>
          )) : <p className="text-sm text-gray-400 text-center py-4">{t(lang, "balance_no_movements")}</p>}
        </div>
      </div>
    </div>
  );
}
