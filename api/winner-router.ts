import { z } from "zod";
import { createRouter, lotteryAuthedQuery, managerLotteryQuery, adminLotteryQuery, creditOpsLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { winners, tickets, plays, lotteryUsers, prizes, creditAdjustments } from "@db/schema";
import { eq, desc, and, gte, lt, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// drawDate llega como "YYYYMMDD". Convierte a rango [inicio del dia, inicio del dia siguiente)
// para poder filtrar los tickets creados exactamente ese dia.
function drawDateRange(drawDate: string): { start: Date; end: Date } {
  const y = Number(drawDate.slice(0, 4));
  const m = Number(drawDate.slice(4, 6)) - 1;
  const d = Number(drawDate.slice(6, 8));
  const start = new Date(y, m, d, 0, 0, 0, 0);
  const end = new Date(y, m, d + 1, 0, 0, 0, 0);
  return { start, end };
}

type PrizeConfig = typeof prizes.$inferSelect;
type PlayRow = typeof plays.$inferSelect;

// Calcula el premio de una jugada segun los 3 numeros ganadores. Compartido entre
// crear un sorteo y reprocesar uno editado, para que ambos calculen exactamente igual.
function calculatePlayPrize(play: PlayRow, prizeConfigs: PrizeConfig[], winningNumbers: string[]): { prize: number; detail: string | null } {
  const prizeConfig = prizeConfigs.find((p) => p.playType === play.type);
  if (!prizeConfig) return { prize: 0, detail: null };

  const playNums = play.number.split("+").map((n) => n.trim());
  let matched = false;
  let multiplier = 0;

  switch (play.type) {
    case "directo": {
      const playNum = play.number;
      if (playNum === winningNumbers[0]) { multiplier = Number(prizeConfig.firstPrizeMultiplier); matched = true; }
      else if (playNum === winningNumbers[1]) { multiplier = Number(prizeConfig.secondPrizeMultiplier); matched = true; }
      else if (playNum === winningNumbers[2]) { multiplier = Number(prizeConfig.thirdPrizeMultiplier); matched = true; }
      break;
    }
    case "pale": {
      if (playNums.length === 2) {
        const sorted = [...playNums].sort().join("+");
        const w12 = [winningNumbers[0], winningNumbers[1]].sort().join("+");
        const w13 = [winningNumbers[0], winningNumbers[2]].sort().join("+");
        const w23 = [winningNumbers[1], winningNumbers[2]].sort().join("+");
        if (sorted === w12) { multiplier = Number(prizeConfig.paleFirstSecondMultiplier); matched = true; }
        else if (sorted === w13) { multiplier = Number(prizeConfig.paleFirstThirdMultiplier); matched = true; }
        else if (sorted === w23) { multiplier = Number(prizeConfig.paleSecondThirdMultiplier); matched = true; }
      }
      break;
    }
    case "tripleta": {
      const sorted = [...playNums].sort().join("+");
      const winSorted = [...winningNumbers].sort().join("+");
      if (sorted === winSorted) { multiplier = Number(prizeConfig.fixedMultiplier); matched = true; }
      break;
    }
    case "terna": {
      const playDigits = play.number.replace(/[^0-9]/g, "");
      const winDigits = winningNumbers.join("").replace(/[^0-9]/g, "");
      if (playDigits.length === 3) {
        const winSet = new Set(winDigits.split(""));
        if (playDigits.split("").every((d) => winSet.has(d))) { multiplier = Number(prizeConfig.fixedMultiplier); matched = true; }
      }
      break;
    }
    case "cuatrena": {
      const playDigits = play.number.replace(/[^0-9]/g, "");
      const winDigits = winningNumbers.join("").replace(/[^0-9]/g, "");
      if (playDigits.length === 4) {
        const winSet = new Set(winDigits.split(""));
        if (playDigits.split("").every((d) => winSet.has(d))) { multiplier = Number(prizeConfig.fixedMultiplier); matched = true; }
      }
      break;
    }
  }

  if (matched && multiplier > 0) {
    const prize = Number(play.amount) * multiplier;
    return { prize, detail: `${play.number.replace(/[^0-9]/g, "")} (${play.type}) x${multiplier} = $${prize.toFixed(2)}` };
  }
  return { prize: 0, detail: null };
}

export const winnerRouter = createRouter({
  list: lotteryAuthedQuery
    .input(z.object({
      lotteryId: z.number().optional(),
      drawDate: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.lotteryId && input?.drawDate) {
        return db.select().from(winners)
          .where(and(eq(winners.lotteryId, input.lotteryId), eq(winners.drawDate, input.drawDate)))
          .orderBy(desc(winners.createdAt));
      }
      if (input?.lotteryId) {
        return db.select().from(winners)
          .where(eq(winners.lotteryId, input.lotteryId))
          .orderBy(desc(winners.createdAt));
      }
      return db.select().from(winners).orderBy(desc(winners.createdAt));
    }),

  // Modificar un resultado ya ingresado. Solo admin/supervisor (el cobrador puede
  // ingresar pero no modificar lo ya guardado). Si lo ingreso el administrador,
  // solo el administrador puede modificarlo. Reprocesa: revierte lo pagado con los
  // numeros viejos y vuelve a pagar segun los numeros nuevos.
  update: managerLotteryQuery
    .input(z.object({
      id: z.number(),
      firstPrize: z.string().min(1),
      secondPrize: z.string().min(1),
      thirdPrize: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const actor = ctx.lotteryUser!;

      const existingRows = await db.select().from(winners).where(eq(winners.id, input.id));
      const existing = existingRows[0];
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Resultado no encontrado." });

      if (existing.createdBy) {
        const creatorRows = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, existing.createdBy));
        const creator = creatorRows[0];
        const rank: Record<string, number> = { admin: 3, supervisor: 2, collector: 1 };
        const actorRank = rank[actor.role] ?? 0;
        const creatorRank = creator ? (rank[creator.role] ?? 0) : 0;
        if (actorRank < creatorRank) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tiene permiso para modificar un resultado ingresado por un rango superior." });
        }
      }

      return db.transaction(async (tx) => {
        // 1) Revertir lo pagado con los numeros anteriores para este sorteo especifico
        const previouslyPaid = await tx.select().from(tickets).where(eq(tickets.winnerId, input.id));
        for (const ticket of previouslyPaid) {
          const paidAmount = Number(ticket.prizeAmount) || 0;
          if (paidAmount > 0) {
            const sellerRows = await tx.select().from(lotteryUsers).where(eq(lotteryUsers.id, ticket.userId));
            const seller = sellerRows[0];
            if (seller) {
              const currentCredit = Number(seller.credit) || 0;
              const newCredit = currentCredit - paidAmount;
              await tx.update(lotteryUsers).set({ credit: newCredit.toFixed(2) }).where(eq(lotteryUsers.id, ticket.userId));
              await tx.insert(creditAdjustments).values({
                userId: ticket.userId,
                adjustedBy: actor.id,
                type: "reversal",
                direction: "subtract",
                amount: paidAmount.toFixed(2),
                balanceAfter: newCredit.toFixed(2),
                note: `Reversion premio ticket ${ticket.code} (resultado corregido)`,
              });
            }
          }
          await tx.update(tickets).set({ status: "active", winnerId: null, prizeAmount: null }).where(eq(tickets.id, ticket.id));
        }

        // 2) Actualizar el resultado
        await tx.update(winners).set({
          firstPrize: input.firstPrize,
          secondPrize: input.secondPrize,
          thirdPrize: input.thirdPrize,
          updatedBy: actor.id,
          updatedAt: new Date(),
        }).where(eq(winners.id, input.id));

        // 3) Volver a pagar segun los numeros nuevos, solo tickets activos de ese dia/loteria
        const { start, end } = drawDateRange(existing.drawDate);
        const candidateTickets = await tx.select().from(tickets).where(and(
          eq(tickets.lotteryId, existing.lotteryId),
          eq(tickets.status, "active"),
          gte(tickets.createdAt, start),
          lt(tickets.createdAt, end),
        ));

        const prizeConfigs = await tx.select().from(prizes);
        const winningNumbers = [input.firstPrize, input.secondPrize, input.thirdPrize];
        const winningResults: Array<{ ticketId: number; ticketCode: string; userId: number; totalPrize: number; details: string[] }> = [];

        for (const ticket of candidateTickets) {
          const ticketPlays = await tx.select().from(plays).where(eq(plays.ticketId, ticket.id));
          let ticketPrize = 0;
          const details: string[] = [];
          for (const play of ticketPlays) {
            const { prize, detail } = calculatePlayPrize(play, prizeConfigs, winningNumbers);
            if (prize > 0 && detail) { ticketPrize += prize; details.push(detail); }
          }
          if (ticketPrize > 0) {
            await tx.update(tickets).set({ status: "winner", winnerId: input.id, prizeAmount: ticketPrize.toFixed(2) }).where(eq(tickets.id, ticket.id));
            const sellerRows = await tx.select().from(lotteryUsers).where(eq(lotteryUsers.id, ticket.userId));
            const seller = sellerRows[0];
            if (seller) {
              const currentCredit = Number(seller.credit) || 0;
              const newCredit = currentCredit + ticketPrize;
              await tx.update(lotteryUsers).set({ credit: newCredit.toFixed(2) }).where(eq(lotteryUsers.id, ticket.userId));
              await tx.insert(creditAdjustments).values({
                userId: ticket.userId,
                adjustedBy: actor.id,
                type: "payout",
                direction: "add",
                amount: ticketPrize.toFixed(2),
                balanceAfter: newCredit.toFixed(2),
                note: `Premio ticket ${ticket.code} (resultado corregido)`,
              });
            }
            winningResults.push({ ticketId: ticket.id, ticketCode: ticket.code, userId: ticket.userId, totalPrize: ticketPrize, details });
          }
        }

        return {
          ok: true,
          reversed: previouslyPaid.length,
          reversedAmount: previouslyPaid.reduce((s, t) => s + (Number(t.prizeAmount) || 0), 0),
          processed: winningResults.length,
          winners: winningResults,
        };
      });
    }),

  create: creditOpsLotteryQuery
    .input(z.object({
      lotteryId: z.number(),
      firstPrize: z.string().min(1),
      secondPrize: z.string().min(1),
      thirdPrize: z.string().min(1),
      drawDate: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      // Cada loteria solo tiene un sorteo (de 3 premios) por dia.
      const dupRows = await db.select().from(winners).where(and(eq(winners.lotteryId, input.lotteryId), eq(winners.drawDate, input.drawDate)));
      if (dupRows.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ya existe un sorteo registrado para esta loteria en esta fecha. Use editar en vez de crear uno nuevo." });
      }

      // Insert winner
      const result = await db.insert(winners).values({
        lotteryId: input.lotteryId,
        firstPrize: input.firstPrize,
        secondPrize: input.secondPrize,
        thirdPrize: input.thirdPrize,
        drawDate: input.drawDate,
        createdBy: ctx.lotteryUser!.id,
      }).returning();
      const winnerId = result[0].id;

      // Solo tickets activos vendidos ESE dia para ESA loteria (no arrastrar tickets de otros dias)
      const { start, end } = drawDateRange(input.drawDate);
      const allTickets = await db.select().from(tickets)
        .where(and(
          eq(tickets.lotteryId, input.lotteryId),
          eq(tickets.status, "active"),
          gte(tickets.createdAt, start),
          lt(tickets.createdAt, end),
        ));

      const prizeConfigs = await db.select().from(prizes);
      const winningNumbers = [input.firstPrize, input.secondPrize, input.thirdPrize];
      const winningResults: Array<{
        ticketId: number;
        ticketCode: string;
        userId: number;
        totalPrize: number;
        details: string[];
      }> = [];

      for (const ticket of allTickets) {
        const ticketPlays = await db.select().from(plays).where(eq(plays.ticketId, ticket.id));
        let ticketPrize = 0;
        const details: string[] = [];

        for (const play of ticketPlays) {
          const { prize, detail } = calculatePlayPrize(play, prizeConfigs, winningNumbers);
          if (prize > 0 && detail) { ticketPrize += prize; details.push(detail); }
        }

        if (ticketPrize > 0) {
          // Mark ticket as winner
          await db.update(tickets).set({ status: "winner", winnerId, prizeAmount: ticketPrize.toFixed(2) }).where(eq(tickets.id, ticket.id));
          // Add prize to seller's credit
          const seller = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, ticket.userId));
          if (seller.length > 0) {
            const currentCredit = Number(seller[0].credit) || 0;
            const newCredit = currentCredit + ticketPrize;
            await db.update(lotteryUsers)
              .set({ credit: newCredit.toFixed(2) })
              .where(eq(lotteryUsers.id, ticket.userId));
            await db.insert(creditAdjustments).values({
              userId: ticket.userId,
              adjustedBy: ctx.lotteryUser!.id,
              type: "payout",
              direction: "add",
              amount: ticketPrize.toFixed(2),
              balanceAfter: newCredit.toFixed(2),
              note: `Premio ticket ${ticket.code}`,
            });
          }
          winningResults.push({
            ticketId: ticket.id,
            ticketCode: ticket.code,
            userId: ticket.userId,
            totalPrize: ticketPrize,
            details,
          });
        }
      }

      return { id: winnerId, processed: winningResults.length, winners: winningResults };
    }),

  // Report: losses/gains per ticket
  report: managerLotteryQuery
    .input(z.object({
      drawDate: z.string(),
      lotteryId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const winnerList = await db.select().from(winners)
        .where(
          input.lotteryId
            ? and(eq(winners.drawDate, input.drawDate), eq(winners.lotteryId, input.lotteryId))
            : eq(winners.drawDate, input.drawDate)
        );

      const report: Array<{
        lotteryId: number;
        drawDate: string;
        winningNumbers: string[];
        totalSales: number;
        totalPrizes: number;
        netResult: number;
        winningTickets: Array<{
          ticketCode: string;
          sellerName: string;
          prize: number;
          plays: string[];
        }>;
      }> = [];

      for (const w of winnerList) {
        const ticketsWithPlays = await db.select().from(tickets)
          .where(and(eq(tickets.winnerId, w.id), eq(tickets.status, "winner")));

        // Ventas totales del dia para esta loteria (todas las activas + las que ganaron)
        const { start, end } = drawDateRange(w.drawDate);
        const allDayTickets = await db.select().from(tickets).where(and(
          eq(tickets.lotteryId, w.lotteryId),
          gte(tickets.createdAt, start),
          lt(tickets.createdAt, end),
        ));
        let totalSales = 0;
        for (const t of allDayTickets) {
          if (t.status !== "cancelled") totalSales += Number(t.total) || 0;
        }

        let totalPrizes = 0;
        const winningTickets: Array<{ ticketCode: string; sellerName: string; prize: number; plays: string[] }> = [];

        for (const t of ticketsWithPlays) {
          const tPlays = await db.select().from(plays).where(eq(plays.ticketId, t.id));
          const seller = await db.select().from(lotteryUsers).where(eq(lotteryUsers.id, t.userId));
          const sellerName = seller.length > 0 ? seller[0].name : `ID:${t.userId}`;
          const ticketPrize = Number(t.prizeAmount) || 0;
          const playDetails = tPlays.map((p) => `${p.number.replace(/[^0-9]/g, "")} (${p.type}) - $${Number(p.amount).toFixed(2)}`);

          totalPrizes += ticketPrize;
          winningTickets.push({ ticketCode: t.code, sellerName, prize: ticketPrize, plays: playDetails });
        }

        report.push({
          lotteryId: w.lotteryId,
          drawDate: w.drawDate,
          winningNumbers: [w.firstPrize, w.secondPrize, w.thirdPrize],
          totalSales,
          totalPrizes,
          netResult: totalSales - totalPrizes,
          winningTickets,
        });
      }

      return report;
    }),

  delete: adminLotteryQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(winners).where(eq(winners.id, input.id));
      return { ok: true };
    }),
});
