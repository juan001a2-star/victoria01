import * as jose from "jose";
import * as cookie from "cookie";
import { env } from "../lib/env";

export const LOTTERY_SESSION_COOKIE = "bv_lottery_session";
const JWT_ALG = "HS256";

function secret() {
  const value = env.appSecret || process.env.SESSION_SECRET || "development-only-change-me";
  return new TextEncoder().encode(value);
}

export type LotterySessionPayload = { lotteryUserId: number; role: string };

export async function signLotterySession(payload: LotterySessionPayload) {
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyLotterySession(headers: Headers) {
  const raw = headers.get("cookie") || "";
  const cookies = cookie.parse(raw);
  const token = cookies[LOTTERY_SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, secret(), { algorithms: [JWT_ALG] });
    if (typeof payload.lotteryUserId !== "number" || typeof payload.role !== "string") return null;
    return { lotteryUserId: payload.lotteryUserId, role: payload.role } as LotterySessionPayload;
  } catch {
    return null;
  }
}

export function lotterySessionCookie(token: string, headers: Headers) {
  const secure = (headers.get("x-forwarded-proto") || "https") === "https";
  return cookie.serialize(LOTTERY_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearLotterySessionCookie(headers: Headers) {
  const secure = (headers.get("x-forwarded-proto") || "https") === "https";
  return cookie.serialize(LOTTERY_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}
