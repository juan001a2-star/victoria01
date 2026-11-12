import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user && !ctx.lotteryUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.unauthenticated });
  }
  return next({ ctx });
});

const requireLotteryAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.lotteryUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Debe iniciar sesión en Banca Victoria." });
  }
  return next({ ctx });
});

function requireLotteryRole(...roles: string[]) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.lotteryUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Debe iniciar sesión." });
    if (!roles.includes(ctx.lotteryUser.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.insufficientRole });
    }
    return next({ ctx });
  });
}

function requireRole(role: string) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.insufficientRole });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const lotteryAuthedQuery = t.procedure.use(requireLotteryAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));
export const adminLotteryQuery = lotteryAuthedQuery.use(requireLotteryRole("admin"));
export const managerLotteryQuery = lotteryAuthedQuery.use(requireLotteryRole("admin", "supervisor"));
export const creditOpsLotteryQuery = lotteryAuthedQuery.use(requireLotteryRole("admin", "supervisor", "collector"));
