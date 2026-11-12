import { authRouter } from "./auth-router";
import { lotteryUserRouter } from "./lottery-user-router";
import { lotteryRouter } from "./lottery-router";
import { groupRouter } from "./group-router";
import { ticketRouter } from "./ticket-router";
import { winnerRouter } from "./winner-router";
import { reportRouter } from "./report-router";
import { prizeRouter } from "./prize-router";
import { syncRouter } from "./sync-router";
import { configRouter } from "./config-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  lotteryUser: lotteryUserRouter,
  lottery: lotteryRouter,
  group: groupRouter,
  ticket: ticketRouter,
  winner: winnerRouter,
  report: reportRouter,
  prize: prizeRouter,
  sync: syncRouter,
  config: configRouter,
});

export type AppRouter = typeof appRouter;
