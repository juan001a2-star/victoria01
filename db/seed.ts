import { getDb } from "../api/queries/connection";
import { lotteries, lotteryUsers, groups, prizes } from "./schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../api/lib/password";

// Default schedule for all days
function defaultSchedule(open: string, close: string) {
  return JSON.stringify({
    mon: { open, close },
    tue: { open, close },
    wed: { open, close },
    thu: { open, close },
    fri: { open, close },
    sat: { open, close },
    sun: { open, close },
  });
}

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  try {
    // Seed default group
    const existingGroup = (await db.select().from(groups).where(eq(groups.name, "Grupo Principal")))[0];
    const groupId = existingGroup?.id ?? (await db.insert(groups).values({ name: "Grupo Principal", maxSalesPerDay: "50000.00", active: true }).returning())[0].id;
    console.log("Default group id:", groupId);

    // Seed admin user
    const existingAdmin = (await db.select().from(lotteryUsers).where(eq(lotteryUsers.username, "admin")))[0];
    if (!existingAdmin) await db.insert(lotteryUsers).values({
      bankNumber: "B-001",
      name: "Administrador",
      username: "admin",
      password: await hashPassword("admin123"),
      phone: "",
      role: "admin",
      groupId: groupId,
      credit: "100000.00",
      commission: "0",
      active: true,
    });
    console.log("Default admin ready.");

    // Seed default lotteries with daily schedules
    const lotteryCount = await db.select({ id: lotteries.id }).from(lotteries).limit(1);
    if (lotteryCount.length === 0) await db.insert(lotteries).values([
      { name: "Loteria Nacional Noche", drawTime: "20:55", openTime: "06:00", closeTime: "20:45", schedule: defaultSchedule("06:00", "20:45"), active: true },
      { name: "Loteria Nacional Tarde", drawTime: "14:55", openTime: "06:00", closeTime: "14:45", schedule: defaultSchedule("06:00", "14:45"), active: true },
      { name: "Leidsa", drawTime: "20:55", openTime: "06:00", closeTime: "20:45", schedule: defaultSchedule("06:00", "20:45"), active: true },
      { name: "Loteria Real", drawTime: "12:55", openTime: "06:00", closeTime: "12:45", schedule: defaultSchedule("06:00", "12:45"), active: true },
      { name: "Loteka", drawTime: "19:55", openTime: "06:00", closeTime: "19:45", schedule: defaultSchedule("06:00", "19:45"), active: true },
      { name: "La Primera", drawTime: "11:55", openTime: "06:00", closeTime: "11:45", schedule: defaultSchedule("06:00", "11:45"), active: true },
      { name: "La Suerte", drawTime: "12:55", openTime: "06:00", closeTime: "12:45", schedule: defaultSchedule("06:00", "12:45"), active: true },
      { name: "LoteDom", drawTime: "20:00", openTime: "06:00", closeTime: "19:45", schedule: defaultSchedule("06:00", "19:45"), active: true },
      { name: "Anguilla", drawTime: "10:00", openTime: "06:00", closeTime: "09:45", schedule: defaultSchedule("06:00", "09:45"), active: true },
      { name: "New York Tarde", drawTime: "14:30", openTime: "06:00", closeTime: "14:15", schedule: defaultSchedule("06:00", "14:15"), active: true },
      { name: "New York Noche", drawTime: "22:30", openTime: "06:00", closeTime: "22:15", schedule: defaultSchedule("06:00", "22:15"), active: true },
      { name: "Florida Tarde", drawTime: "13:30", openTime: "06:00", closeTime: "13:15", schedule: defaultSchedule("06:00", "13:15"), active: true },
      { name: "Florida Noche", drawTime: "21:45", openTime: "06:00", closeTime: "21:30", schedule: defaultSchedule("06:00", "21:30"), active: true },
    ]);
    console.log("Created 13 default lotteries with daily schedules");

    // Seed default prizes
    const prizeCount = await db.select({ id: prizes.id }).from(prizes).limit(1);
    if (prizeCount.length === 0) await db.insert(prizes).values([
      { playType: "directo", firstPrizeMultiplier: "50", secondPrizeMultiplier: "15", thirdPrizeMultiplier: "10", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "0", description: "1er=50x, 2do=15x, 3ro=10x" },
      { playType: "pale", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "25", paleFirstThirdMultiplier: "20", paleSecondThirdMultiplier: "15", fixedMultiplier: "0", description: "1+2=25x, 1+3=20x, 2+3=15x" },
      { playType: "terna", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "500", description: "3 cifras = 500x" },
      { playType: "cuatrena", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "4000", description: "4 cifras = 4,000x" },
      { playType: "tripleta", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "10000", description: "Tripleta = 10,000x" },
    ]);
    console.log("Created 5 default prizes");

    console.log("Seeding complete!");
  } catch (err) {
    console.log("Seed error (may already exist):", (err as Error).message);
  }
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
