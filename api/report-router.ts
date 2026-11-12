import { z } from "zod";
import { createRouter, managerLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tickets, lotteryUsers, groups, lotteries } from "@db/schema";
import { eq, desc } from "drizzle-orm";

export const reportRouter = createRouter({
  // Dashboard summary
  dashboard: managerLotteryQuery.query(async () => {
    const db = getDb();
    const allTickets = await db.select().from(tickets);
    const activeTickets = allTickets.filter((t) => t.status !== "cancelled");
    const cancelledTickets = allTickets.filter((t) => t.status === "cancelled");
    const allUsers = await db.select().from(lotteryUsers);
    const allGroups = await db.select().from(groups);
    const allLotteries = await db.select().from(lotteries);

    const totalSales = activeTickets.reduce((sum, t) => sum + Number(t.total), 0);

    return {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter((u) => u.active).length,
      totalGroups: allGroups.length,
      totalLotteries: allLotteries.length,
      totalTickets: allTickets.length,
      totalSales: totalSales.toFixed(2),
      cancelledTickets: cancelledTickets.length,
    };
  }),

  // Sales by group
  salesByGroup: managerLotteryQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const members = await db.select().from(lotteryUsers).where(eq(lotteryUsers.groupId, input.groupId));
      const memberIds = members.map((m) => m.id);

      const groupTickets = await db.select().from(tickets);
      const filteredTickets = groupTickets.filter((t) => memberIds.includes(t.userId) && t.status !== "cancelled");

      const total = filteredTickets.reduce((sum, t) => sum + Number(t.total), 0);

      return {
        memberCount: members.length,
        ticketCount: filteredTickets.length,
        totalSales: total.toFixed(2),
        members: members.map((m) => ({ id: m.id, name: m.name, role: m.role, credit: m.credit })),
      };
    }),

  // Tickets by group
  ticketsByGroup: managerLotteryQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const members = await db.select().from(lotteryUsers).where(eq(lotteryUsers.groupId, input.groupId));
      const memberIds = members.map((m) => m.id);

      const allTickets = await db.select().from(tickets).orderBy(desc(tickets.createdAt));
      return allTickets.filter((t) => memberIds.includes(t.userId));
    }),

  // Sales by user
  salesByUser: managerLotteryQuery
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const userTickets = await db.select().from(tickets)
        .where(eq(tickets.userId, input.userId));
      const active = userTickets.filter((t) => t.status !== "cancelled");
      const total = active.reduce((sum, t) => sum + Number(t.total), 0);
      return {
        totalTickets: userTickets.length,
        activeTickets: active.length,
        totalSales: total.toFixed(2),
      };
    }),
});
