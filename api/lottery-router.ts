import { z } from "zod";
import { createRouter, lotteryAuthedQuery, adminLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { lotteries, playLimits } from "@db/schema";
import { eq, desc, and } from "drizzle-orm";

export const lotteryRouter = createRouter({
  list: lotteryAuthedQuery.query(async () => {
    const db = getDb();
    return db.select().from(lotteries).orderBy(desc(lotteries.createdAt));
  }),

  create: adminLotteryQuery
    .input(z.object({
      name: z.string().min(1),
      drawTime: z.string().min(1),
      openTime: z.string().min(1),
      closeTime: z.string().min(1),
      schedule: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(lotteries).values({
        name: input.name,
        drawTime: input.drawTime,
        openTime: input.openTime,
        closeTime: input.closeTime,
        schedule: input.schedule || null,
        active: true,
      }).returning();
      return { id: result[0].id };
    }),

  update: adminLotteryQuery
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      drawTime: z.string().optional(),
      openTime: z.string().optional(),
      closeTime: z.string().optional(),
      schedule: z.string().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      const updateData: Record<string, any> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.drawTime !== undefined) updateData.drawTime = data.drawTime;
      if (data.openTime !== undefined) updateData.openTime = data.openTime;
      if (data.closeTime !== undefined) updateData.closeTime = data.closeTime;
      if (data.schedule !== undefined) updateData.schedule = data.schedule;
      if (data.active !== undefined) updateData.active = data.active;
      await db.update(lotteries).set(updateData).where(eq(lotteries.id, id));
      return { ok: true };
    }),

  delete: adminLotteryQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      try {
        await db.delete(lotteries).where(eq(lotteries.id, input.id));
        return { ok: true, deactivated: false };
      } catch (err: any) {
        // Tiene tickets/jugadas/limites historicos referenciandola (foreign key) -> no se puede borrar sin perder el historial.
        // La desactivamos para que deje de aparecer para venta, en vez de fallar en silencio.
        if (err?.code === "23503" || /foreign key/i.test(String(err?.message || ""))) {
          await db.update(lotteries).set({ active: false }).where(eq(lotteries.id, input.id));
          return { ok: true, deactivated: true };
        }
        throw err;
      }
    }),

  // ── Play Limits for pale/tripleta ────────────────────────────────────
  getLimits: lotteryAuthedQuery
    .input(z.object({ lotteryId: z.number() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.lotteryId) {
        return db.select().from(playLimits)
          .where(eq(playLimits.lotteryId, input.lotteryId))
          .orderBy(desc(playLimits.createdAt));
      }
      return db.select().from(playLimits).orderBy(desc(playLimits.createdAt));
    }),

  setLimit: adminLotteryQuery
    .input(z.object({
      lotteryId: z.number(),
      playType: z.enum(["pale", "tripleta"]),
      numberCombo: z.string().min(1),
      maxAmount: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      // Normalize the combination (sort parts)
      const normalized = input.numberCombo.split("+").map(s => s.trim()).sort().join("+");
      // Check if limit already exists
      const existing = await db.select().from(playLimits).where(
        and(
          eq(playLimits.lotteryId, input.lotteryId),
          eq(playLimits.playType, input.playType),
          eq(playLimits.numberCombo, normalized)
        )
      );
      if (existing.length > 0) {
        await db.update(playLimits)
          .set({ maxAmount: input.maxAmount })
          .where(eq(playLimits.id, existing[0].id));
        return { id: existing[0].id, updated: true };
      }
      const result = await db.insert(playLimits).values({
        lotteryId: input.lotteryId,
        playType: input.playType,
        numberCombo: normalized,
        maxAmount: input.maxAmount,
      }).returning();
      return { id: result[0].id, updated: false };
    }),

  deleteLimit: adminLotteryQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(playLimits).where(eq(playLimits.id, input.id));
      return { ok: true };
    }),

  // Check if a play is within limits
  checkLimit: lotteryAuthedQuery
    .input(z.object({
      lotteryId: z.number(),
      playType: z.enum(["pale", "tripleta"]),
      numberCombo: z.string(),
      amount: z.string(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const normalized = input.numberCombo.split("+").map(s => s.trim()).sort().join("+");
      const limit = await db.select().from(playLimits).where(
        and(
          eq(playLimits.lotteryId, input.lotteryId),
          eq(playLimits.playType, input.playType),
          eq(playLimits.numberCombo, normalized)
        )
      );
      if (limit.length === 0) return { allowed: true, reason: null };
      const newAmount = Number(input.amount);
      const maxAllowed = Number(limit[0].maxAmount);
      if (newAmount > maxAllowed) {
        return { allowed: false, reason: `Limite de $${maxAllowed} para ${normalized}` };
      }
      return { allowed: true, reason: null, limit: maxAllowed };
    }),
});
