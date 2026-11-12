import { z } from "zod";
import { createRouter, lotteryAuthedQuery, managerLotteryQuery, adminLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { groups, lotteryUsers } from "@db/schema";
import { eq, desc } from "drizzle-orm";

export const groupRouter = createRouter({
  list: lotteryAuthedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const actor = ctx.lotteryUser!;
    if (actor.role === "supervisor" || actor.role === "collector") {
      if (!actor.groupId) return [];
      return db.select().from(groups).where(eq(groups.id, actor.groupId)).orderBy(desc(groups.createdAt));
    }
    return db.select().from(groups).orderBy(desc(groups.createdAt));
  }),
  create: adminLotteryQuery.input(z.object({ name: z.string().min(1), maxSalesPerDay: z.string().optional() })).mutation(async ({ input }) => {
    const result = await getDb().insert(groups).values({ name: input.name, maxSalesPerDay: input.maxSalesPerDay || "50000.00", active: true }).returning();
    return { id: result[0].id };
  }),
  update: adminLotteryQuery.input(z.object({ id: z.number(), name: z.string().optional(), maxSalesPerDay: z.string().optional(), active: z.boolean().optional() })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await getDb().update(groups).set(data).where(eq(groups.id, id));
    return { ok: true };
  }),
  delete: adminLotteryQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await getDb().delete(groups).where(eq(groups.id, input.id));
    return { ok: true };
  }),
  members: managerLotteryQuery.input(z.object({ groupId: z.number() })).query(async ({ input }) => getDb().select().from(lotteryUsers).where(eq(lotteryUsers.groupId, input.groupId))),
});
