import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { AuthUser } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb()
    .select()
    .from(schema.authUsers)
    .where(eq(schema.authUsers.unionId, unionId))
    .limit(1);
  return rows.at(0);
}

export async function upsertUser(data: Partial<AuthUser> & { unionId: string }) {
  const values = { ...data };
  const updateSet: Partial<AuthUser> & { updatedAt: Date } = {
    ...data,
    updatedAt: new Date(),
  };

  if (
    values.role === undefined &&
    values.unionId &&
    values.unionId === env.ownerUnionId
  ) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await getDb()
    .insert(schema.authUsers)
    .values(values as any)
    .onConflictDoUpdate({
      target: schema.authUsers.unionId,
      set: updateSet,
    });
}
