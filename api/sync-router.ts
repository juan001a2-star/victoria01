import { z } from "zod";
import { createRouter, publicQuery, adminLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tickets, plays, lotteryUsers, groups } from "@db/schema";
import { eq } from "drizzle-orm";

export const syncRouter = createRouter({
  // Receive tickets from frontend
  uploadTickets: adminLotteryQuery
    .input(z.array(z.object({
      code: z.string(),
      userId: z.number(),
      lotteryId: z.number(),
      total: z.string(),
      status: z.string(),
      date: z.string(),
      time: z.string(),
      terminal: z.string(),
      seller: z.string(),
      lottery: z.string(),
      plays: z.array(z.object({
        number: z.string(),
        amount: z.string(),
        type: z.enum(["directo", "pale", "tripleta", "cuatrena", "terna"]),
        lotteryId: z.number(),
        lotteryName: z.string(),
      })),
    })))
    .mutation(async ({ input }) => {
      const db = getDb();
      const results = [];
      for (const ticketData of input) {
        // Check if ticket already exists
        const existing = await db.select().from(tickets).where(eq(tickets.code, ticketData.code));
        if (existing.length > 0) {
          results.push({ code: ticketData.code, status: "exists" });
          continue;
        }
        // Insert ticket
        const result = await db.insert(tickets).values({
          code: ticketData.code,
          userId: ticketData.userId,
          lotteryId: ticketData.lotteryId,
          total: ticketData.total,
          status: ticketData.status as any,
        }).returning();
        const ticketId = result[0].id;
        // Insert plays
        for (const play of ticketData.plays) {
          await db.insert(plays).values({
            ticketId,
            number: play.number,
            amount: play.amount,
            type: play.type,
            lotteryId: play.lotteryId,
          });
        }
        results.push({ code: ticketData.code, status: "uploaded" });
      }
      return { ok: true, results };
    }),

  // Download all tickets for a user
  downloadTickets: adminLotteryQuery
    .input(z.object({ userId: z.number() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const allTickets = await db.select().from(tickets);
      const allPlays = await db.select().from(plays);
      const enriched = allTickets.map((t) => ({
        ...t,
        plays: allPlays.filter((p) => p.ticketId === t.id),
      }));
      if (input?.userId) {
        return enriched.filter((t) => t.userId === input.userId);
      }
      return enriched;
    }),

  // Upload users from frontend
  uploadUsers: adminLotteryQuery
    .input(z.array(z.object({
      id: z.number(),
      bankNumber: z.string(),
      name: z.string(),
      username: z.string(),
      password: z.string(),
      phone: z.string().optional(),
      role: z.enum(["admin", "supervisor", "collector", "user"]),
      groupId: z.number().nullable(),
      credit: z.string(),
      active: z.boolean(),
    })))
    .mutation(async ({ input }) => {
      const db = getDb();
      for (const user of input) {
        const existing = await db.select().from(lotteryUsers).where(eq(lotteryUsers.username, user.username));
        if (existing.length > 0) {
          await db.update(lotteryUsers).set({
            name: user.name,
            password: user.password,
            phone: user.phone,
            role: user.role,
            groupId: user.groupId,
            credit: user.credit,
            active: user.active,
          }).where(eq(lotteryUsers.id, existing[0].id));
        } else {
          await db.insert(lotteryUsers).values({
            bankNumber: user.bankNumber,
            name: user.name,
            username: user.username,
            password: user.password,
            phone: user.phone,
            role: user.role,
            groupId: user.groupId,
            credit: user.credit,
            active: user.active,
          });
        }
      }
      return { ok: true };
    }),

  // Download all users
  downloadUsers: adminLotteryQuery.query(async () => {
    const db = getDb();
    return db.select().from(lotteryUsers);
  }),

  // Upload groups
  uploadGroups: adminLotteryQuery
    .input(z.array(z.object({
      id: z.number(),
      name: z.string(),
      active: z.boolean(),
    })))
    .mutation(async ({ input }) => {
      const db = getDb();
      for (const group of input) {
        const existing = await db.select().from(groups).where(eq(groups.id, group.id));
        if (existing.length > 0) {
          await db.update(groups).set({ name: group.name, active: group.active }).where(eq(groups.id, group.id));
        } else {
          await db.insert(groups).values({ name: group.name, active: group.active });
        }
      }
      return { ok: true };
    }),

  // Download groups
  downloadGroups: adminLotteryQuery.query(async () => {
    const db = getDb();
    return db.select().from(groups);
  }),

  // Health check
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
});
