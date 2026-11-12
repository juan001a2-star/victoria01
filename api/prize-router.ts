import { z } from "zod";
import { createRouter, lotteryAuthedQuery, adminLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { prizes } from "@db/schema";
import { eq } from "drizzle-orm";

export const prizeRouter = createRouter({
  // Get all prize configurations
  list: lotteryAuthedQuery.query(async () => {
    const db = getDb();
    return db.select().from(prizes);
  }),

  // Get prize by play type
  byType: lotteryAuthedQuery
    .input(z.object({ playType: z.enum(["directo", "pale", "tripleta", "cuatrena", "terna"]) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(prizes).where(eq(prizes.playType, input.playType));
      return rows[0] || null;
    }),

  // Update prize configuration
  update: adminLotteryQuery
    .input(z.object({
      id: z.number(),
      firstPrizeMultiplier: z.string().optional(),
      secondPrizeMultiplier: z.string().optional(),
      thirdPrizeMultiplier: z.string().optional(),
      paleFirstSecondMultiplier: z.string().optional(),
      paleFirstThirdMultiplier: z.string().optional(),
      paleSecondThirdMultiplier: z.string().optional(),
      fixedMultiplier: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      const updateData: Record<string, any> = {};
      if (data.firstPrizeMultiplier !== undefined) updateData.firstPrizeMultiplier = data.firstPrizeMultiplier;
      if (data.secondPrizeMultiplier !== undefined) updateData.secondPrizeMultiplier = data.secondPrizeMultiplier;
      if (data.thirdPrizeMultiplier !== undefined) updateData.thirdPrizeMultiplier = data.thirdPrizeMultiplier;
      if (data.paleFirstSecondMultiplier !== undefined) updateData.paleFirstSecondMultiplier = data.paleFirstSecondMultiplier;
      if (data.paleFirstThirdMultiplier !== undefined) updateData.paleFirstThirdMultiplier = data.paleFirstThirdMultiplier;
      if (data.paleSecondThirdMultiplier !== undefined) updateData.paleSecondThirdMultiplier = data.paleSecondThirdMultiplier;
      if (data.fixedMultiplier !== undefined) updateData.fixedMultiplier = data.fixedMultiplier;
      if (data.description !== undefined) updateData.description = data.description;
      await db.update(prizes).set(updateData).where(eq(prizes.id, id));
      return { ok: true };
    }),

  // Calculate potential prize for a play
  calculate: lotteryAuthedQuery
    .input(z.object({
      playType: z.enum(["directo", "pale", "tripleta", "cuatrena", "terna"]),
      amount: z.string(),
      prizePosition: z.enum(["first", "second", "third", "first_second", "first_third", "second_third"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(prizes).where(eq(prizes.playType, input.playType));
      const prize = rows[0];
      if (!prize) return { payout: "0" };

      const amount = Number(input.amount);
      let multiplier = 0;

      switch (input.playType) {
        case "directo":
          if (input.prizePosition === "first") multiplier = Number(prize.firstPrizeMultiplier);
          else if (input.prizePosition === "second") multiplier = Number(prize.secondPrizeMultiplier);
          else if (input.prizePosition === "third") multiplier = Number(prize.thirdPrizeMultiplier);
          else multiplier = Number(prize.firstPrizeMultiplier); // default to first
          break;
        case "pale":
          if (input.prizePosition === "first_second") multiplier = Number(prize.paleFirstSecondMultiplier);
          else if (input.prizePosition === "first_third") multiplier = Number(prize.paleFirstThirdMultiplier);
          else if (input.prizePosition === "second_third") multiplier = Number(prize.paleSecondThirdMultiplier);
          else multiplier = Number(prize.paleFirstSecondMultiplier); // default
          break;
        case "terna":
        case "cuatrena":
        case "tripleta":
          multiplier = Number(prize.fixedMultiplier);
          break;
      }

      const payout = amount * multiplier;
      return {
        payout: payout.toFixed(2),
        multiplier: multiplier.toFixed(2),
        amount: input.amount,
      };
    }),
});
