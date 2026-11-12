import { z } from "zod";
import { createRouter, lotteryAuthedQuery, managerLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tickets, plays, lotteryUsers, config, playLimits, lotteries } from "@db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function getGuianaNow(): { dayKey: typeof DAY_KEYS[number]; mins: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Cayenne",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, typeof DAY_KEYS[number]> = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };
  const dayKey = weekdayMap[map.weekday] || "sun";
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const mins = hour * 60 + Number(map.minute);
  return { dayKey, mins };
}

function isLotteryOpenNow(lottery: { schedule?: string | null; closeTime?: string; drawTime?: string }): boolean {
  let schedule: Record<string, { open: string; close: string }> | null = null;
  if (lottery.schedule) {
    try { schedule = JSON.parse(lottery.schedule); } catch { schedule = null; }
  }
  const { dayKey, mins: currentMins } = getGuianaNow();
  const daySched = schedule?.[dayKey];
  const closeTime = daySched?.close || lottery.closeTime || lottery.drawTime || "20:00";
  const openTime = daySched?.open || "07:00";
  const [openH, openM] = openTime.split(":").map(Number);
  const [closeH, closeM] = closeTime.split(":").map(Number);
  const openMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;
  return currentMins >= openMins && currentMins < closeMins;
}

export const ticketRouter = createRouter({
  create: lotteryAuthedQuery
    .input(z.object({
      code: z.string().min(1).max(30),
      userId: z.number(),
      lotteryId: z.number(),
      total: z.string().refine(v => Number.isFinite(Number(v)) && Number(v) > 0, "Total inválido"),
      commission: z.string().optional(),
      netDeduction: z.string().optional(),
      validDays: z.number().int().positive().max(365).optional(),
      playList: z.array(z.object({
        number: z.string().min(1).max(50),
        amount: z.string().refine(v => Number.isFinite(Number(v)) && Number(v) > 0, "Monto inválido"),
        type: z.enum(["directo", "pale", "tripleta", "cuatrena", "terna"]),
        lotteryId: z.number(),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (ctx.lotteryUser!.id !== input.userId && !["admin", "supervisor"].includes(ctx.lotteryUser!.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No puede crear tickets para otro usuario." });
      }
      const total = Number(input.total);
      const commissionPct = Number(input.commission ?? ctx.lotteryUser!.commission ?? 0);
      const net = input.netDeduction !== undefined ? Number(input.netDeduction) : total * (1 - commissionPct / 100);
      if (!Number.isFinite(net) || net < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Deducción inválida." });

      return db.transaction(async (tx) => {
        const sellerRows = await tx.select().from(lotteryUsers).where(eq(lotteryUsers.id, input.userId));
        const seller = sellerRows[0];
        if (!seller || !seller.active) throw new TRPCError({ code: "BAD_REQUEST", message: "Vendedor inválido o inactivo." });

        const involvedLotteryIds = [...new Set(input.playList.map(p => p.lotteryId))];
        for (const lId of involvedLotteryIds) {
          const lotteryRows = await tx.select().from(lotteries).where(eq(lotteries.id, lId));
          const lottery = lotteryRows[0];
          if (!lottery || !lottery.active) throw new TRPCError({ code: "BAD_REQUEST", message: "Loteria no disponible." });
          if (!isLotteryOpenNow(lottery)) throw new TRPCError({ code: "BAD_REQUEST", message: `${lottery.name} ya cerro. No se puede vender.` });
        }

        const currentCredit = Number(seller.credit);
        if (currentCredit < net) throw new TRPCError({ code: "BAD_REQUEST", message: "Crédito insuficiente." });

        const existing = await tx.select({ id: tickets.id }).from(tickets).where(eq(tickets.code, input.code));
        if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "El código de ticket ya existe." });

        const configRow = (await tx.select().from(config).where(eq(config.key, "system")))[0];
        if (configRow?.value) {
          try {
            const settings = JSON.parse(configRow.value) as { maxBetAmount?: string | number };
            const maxBet = Number(settings.maxBetAmount || 0);
            if (maxBet > 0 && input.playList.some(p => Number(p.amount) > maxBet)) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Una jugada supera el límite de $${maxBet.toFixed(2)}.` });
            }
          } catch (err) {
            if (err instanceof TRPCError) throw err;
          }
        }
        // Aggregate amounts per normalized combo within this same ticket first
        const comboTotals = new Map<string, number>();
        for (const play of input.playList) {
          if (play.type === "pale" || play.type === "tripleta") {
            const normalized = play.number.split("+").map(v => v.trim()).sort().join("+");
            const key = `${play.lotteryId}|${play.type}|${normalized}`;
            comboTotals.set(key, (comboTotals.get(key) || 0) + Number(play.amount));
          }
        }
        for (const [key, ticketAmount] of comboTotals) {
          const [lotteryIdStr, playType, normalized] = key.split("|");
          const lotteryIdNum = Number(lotteryIdStr);
          const limitRows = await tx.select().from(playLimits).where(and(eq(playLimits.lotteryId, lotteryIdNum), eq(playLimits.playType, playType as "pale" | "tripleta"), eq(playLimits.numberCombo, normalized)));
          if (limitRows[0]) {
            const maxAmount = Number(limitRows[0].maxAmount);
            const soldRows = await tx.select({ number: plays.number, amount: plays.amount })
              .from(plays)
              .innerJoin(tickets, eq(plays.ticketId, tickets.id))
              .where(and(eq(tickets.status, "active"), eq(plays.lotteryId, lotteryIdNum), eq(plays.type, playType as "pale" | "tripleta")));
            const alreadySold = soldRows
              .filter(r => r.number.split("+").map(v => v.trim()).sort().join("+") === normalized)
              .reduce((sum, r) => sum + Number(r.amount), 0);
            const wouldBe = alreadySold + ticketAmount;
            if (wouldBe > maxAmount) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Límite de $${maxAmount.toFixed(2)} para ${normalized}. Ya vendido: $${alreadySold.toFixed(2)} + $${ticketAmount.toFixed(2)} = $${wouldBe.toFixed(2)}.` });
            }
          }
        }

        const ticketResult = await tx.insert(tickets).values({
          code: input.code,
          userId: input.userId,
          lotteryId: input.lotteryId,
          total: total.toFixed(2),
          commission: commissionPct.toFixed(2),
          netDeduction: net.toFixed(2),
          status: "active",
        }).returning();
        const ticketId = ticketResult[0].id;

        await tx.insert(plays).values(input.playList.map(play => ({
          ticketId,
          number: play.number,
          amount: Number(play.amount).toFixed(2),
          type: play.type,
          lotteryId: play.lotteryId,
        })));

        const newCredit = currentCredit - net;
        await tx.update(lotteryUsers).set({ credit: newCredit.toFixed(2) }).where(eq(lotteryUsers.id, input.userId));
        return { ticketId, code: input.code, credit: newCredit.toFixed(2) };
      });
    }),

  list: lotteryAuthedQuery
    .input(z.object({ userId: z.number().optional(), status: z.enum(["active", "cancelled", "paid", "winner"]).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const requestedUserId = input?.userId;
      const actor = ctx.lotteryUser!;
      const isManager = ["admin", "supervisor"].includes(actor.role);
      const isGroupScoped = ["supervisor", "collector"].includes(actor.role);

      const conditions = [];
      if (isGroupScoped) {
        // supervisor/cobrador: limitado a los tickets de vendedores de su propio grupo
        const groupUserRows = actor.groupId
          ? await db.select({ id: lotteryUsers.id }).from(lotteryUsers).where(eq(lotteryUsers.groupId, actor.groupId))
          : [];
        const groupUserIds = groupUserRows.map((r) => r.id);
        if (requestedUserId) {
          if (!groupUserIds.includes(requestedUserId)) throw new TRPCError({ code: "FORBIDDEN", message: "Ese usuario no pertenece a su grupo." });
          conditions.push(eq(tickets.userId, requestedUserId));
        } else if (groupUserIds.length > 0) {
          conditions.push(inArray(tickets.userId, groupUserIds));
        } else {
          return [];
        }
      } else {
        const userId = isManager ? requestedUserId : actor.id;
        if (userId) conditions.push(eq(tickets.userId, userId));
      }
      if (input?.status) conditions.push(eq(tickets.status, input.status));
      return db.select().from(tickets)
        .where(conditions.length === 1 ? conditions[0] : conditions.length > 1 ? and(...conditions) : undefined)
        .orderBy(desc(tickets.createdAt));
    }),

  withPlays: lotteryAuthedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const ticketRows = await db.select().from(tickets).where(eq(tickets.id, input.id));
      const ticket = ticketRows[0];
      if (!ticket) return { ticket: null, plays: [] };
      const isManager = ["admin", "supervisor"].includes(ctx.lotteryUser!.role);
      if (!isManager && ticket.userId !== ctx.lotteryUser!.id) throw new TRPCError({ code: "FORBIDDEN", message: "Acceso denegado." });
      const playRows = await db.select().from(plays).where(eq(plays.ticketId, input.id));
      return { ticket, plays: playRows };
    }),

  byCode: lotteryAuthedQuery
    .input(z.object({ code: z.string().min(1).max(30) }))
    .query(async ({ input }) => {
      const db = getDb();
      const ticketRows = await db.select().from(tickets).where(eq(tickets.code, input.code));
      if (ticketRows.length === 0) return { ticket: null, plays: [] };
      const playRows = await db.select().from(plays).where(eq(plays.ticketId, ticketRows[0].id));
      return { ticket: ticketRows[0], plays: playRows };
    }),

  validate: lotteryAuthedQuery
    .input(z.object({ code: z.string().min(1).max(30) }))
    .query(async ({ input }) => {
      const db = getDb();
      const ticketRows = await db.select().from(tickets).where(eq(tickets.code, input.code));
      if (ticketRows.length === 0) return { valid: false, reason: "Ticket no encontrado" };
      const ticket = ticketRows[0];
      if (ticket.status === "cancelled") return { valid: false, reason: "Ticket anulado" };
      if (ticket.status === "paid") return { valid: false, reason: "Ticket ya fue pagado" };
      const createdAt = new Date(ticket.createdAt);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);
      if (diffDays > 30) return { valid: false, reason: `Ticket expirado (${diffDays} dias)` };
      return { valid: true, ticket, ...(createdAt.getTime() < new Date(new Date().setHours(0,0,0,0)).getTime() ? { warning: `Ticket de hace ${diffDays} dias` } : {}) };
    }),

  annul: lotteryAuthedQuery
    .input(z.object({ id: z.number(), annulledBy: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db.select().from(tickets).where(eq(tickets.id, input.id));
      const ticket = rows[0];
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket no encontrado." });
      if (ticket.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "El ticket ya no está activo." });

      const isManager = ["admin", "supervisor"].includes(ctx.lotteryUser!.role);
      if (isManager) {
        if (ctx.lotteryUser!.role === "supervisor" && ticket.userId !== input.annulledBy) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No puede anular tickets de otro vendedor." });
        }
      } else {
        if (ticket.userId !== ctx.lotteryUser!.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No puede anular tickets de otro vendedor." });
        }
        const elapsedMs = Date.now() - new Date(ticket.createdAt).getTime();
        if (elapsedMs > 5 * 60 * 1000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Solo puede anular dentro de los primeros 5 minutos." });
        }
        const lotteryRows = await db.select().from(lotteries).where(eq(lotteries.id, ticket.lotteryId));
        const lottery = lotteryRows[0];
        if (lottery && !isLotteryOpenNow(lottery)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "La lotería ya cerró; no puede anular este ticket." });
        }
      }

      await db.transaction(async tx => {
        await tx.update(tickets).set({ status: "cancelled", annulledBy: ctx.lotteryUser!.id, annulledAt: new Date() }).where(eq(tickets.id, input.id));
        const sellerRows = await tx.select().from(lotteryUsers).where(eq(lotteryUsers.id, ticket.userId));
        if (sellerRows[0]) {
          const restored = Number(sellerRows[0].credit) + Number(ticket.netDeduction);
          await tx.update(lotteryUsers).set({ credit: restored.toFixed(2) }).where(eq(lotteryUsers.id, ticket.userId));
        }
      });
      return { ok: true };
    }),

  updateStatus: managerLotteryQuery
    .input(z.object({ id: z.number(), status: z.enum(["active", "paid", "winner"]) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(tickets).set({ status: input.status }).where(eq(tickets.id, input.id));
      return { ok: true };
    }),
});
