import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { AuthUser } from "@db/schema";
import { authenticateRequest } from "./kimi/auth";
import { verifyLotterySession } from "./kimi/lottery-session";
import { getDb } from "./queries/connection";
import { lotteryUsers } from "@db/schema";
import { eq } from "drizzle-orm";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: AuthUser;
  lotteryUser?: typeof lotteryUsers.$inferSelect;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    // Kimi authentication is optional for the lottery application.
  }
  try {
    const session = await verifyLotterySession(opts.req.headers);
    if (session) {
      const rows = await getDb().select().from(lotteryUsers).where(eq(lotteryUsers.id, session.lotteryUserId));
      const user = rows[0];
      if (user && user.active && user.role === session.role) ctx.lotteryUser = user;
    }
  } catch {
    // Invalid/expired lottery sessions remain unauthenticated.
  }
  return ctx;
}
