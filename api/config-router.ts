import { z } from "zod";
import { createRouter, lotteryAuthedQuery, managerLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { config } from "@db/schema";
import { eq } from "drizzle-orm";

export const configRouter = createRouter({
  get: lotteryAuthedQuery.input(z.object({ key: z.string().min(1).max(100) })).query(async ({ input }) => {
    const row = (await getDb().select().from(config).where(eq(config.key, input.key)))[0];
    return row?.value ?? null;
  }),
  set: managerLotteryQuery.input(z.object({ key: z.string().min(1).max(100), value: z.string() })).mutation(async ({ input }) => {
    const db = getDb();
    const existing = (await db.select().from(config).where(eq(config.key, input.key)))[0];
    if (existing) await db.update(config).set({ value: input.value }).where(eq(config.id, existing.id));
    else await db.insert(config).values({ key: input.key, value: input.value });
    return { ok: true };
  }),
});
