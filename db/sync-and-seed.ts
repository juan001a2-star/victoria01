import { getDb } from "../api/queries/connection";
import { lotteryUsers, lotteries, prizes, groups } from "./schema";
import { eq } from "drizzle-orm";

async function syncAndSeed() {
  const db = getDb();
  console.log("Checking and seeding database...");

  // Check if admin exists
  const existingUsers = await db.select().from(lotteryUsers).where(eq(lotteryUsers.username, "admin"));
  if (existingUsers.length === 0) {
    // Seed admin user
    await db.insert(lotteryUsers).values({
      bankNumber: "B-001",
      name: "Administrador",
      username: "admin",
      password: "admin123",
      phone: "",
      role: "admin",
      groupId: null,
      credit: "100000.00",
      active: true,
    });
    console.log("Admin user created (admin / admin123)");
  } else {
    console.log("Admin user already exists");
  }

  // Check if default group exists
  const existingGroups = await db.select().from(groups);
  if (existingGroups.length === 0) {
    await db.insert(groups).values({
      name: "Grupo Principal",
      maxSalesPerDay: "50000.00",
      active: true,
    });
    console.log("Default group created");
  } else {
    console.log("Groups already exist:", existingGroups.length);
  }

  // Check if lotteries exist
  const existingLotteries = await db.select().from(lotteries);
  if (existingLotteries.length === 0) {
    await db.insert(lotteries).values([
      { name: "Loteria Nacional Noche", drawTime: "20:55", openTime: "06:00", closeTime: "20:45", active: true },
      { name: "Loteria Nacional Tarde", drawTime: "14:55", openTime: "06:00", closeTime: "14:45", active: true },
      { name: "Leidsa", drawTime: "20:55", openTime: "06:00", closeTime: "20:45", active: true },
      { name: "Loteria Real", drawTime: "12:55", openTime: "06:00", closeTime: "12:45", active: true },
      { name: "Loteka", drawTime: "19:55", openTime: "06:00", closeTime: "19:45", active: true },
      { name: "La Primera", drawTime: "11:55", openTime: "06:00", closeTime: "11:45", active: true },
      { name: "La Suerte", drawTime: "12:55", openTime: "06:00", closeTime: "12:45", active: true },
      { name: "LoteDom", drawTime: "20:00", openTime: "06:00", closeTime: "19:45", active: true },
      { name: "Anguilla", drawTime: "10:00", openTime: "06:00", closeTime: "09:45", active: true },
      { name: "New York Tarde", drawTime: "14:30", openTime: "06:00", closeTime: "14:15", active: true },
      { name: "New York Noche", drawTime: "22:30", openTime: "06:00", closeTime: "22:15", active: true },
      { name: "Florida Tarde", drawTime: "13:30", openTime: "06:00", closeTime: "13:15", active: true },
      { name: "Florida Noche", drawTime: "21:45", openTime: "06:00", closeTime: "21:30", active: true },
    ]);
    console.log("13 lotteries seeded");
  } else {
    console.log("Lotteries already exist:", existingLotteries.length);
  }

  // Check if prizes exist
  const existingPrizes = await db.select().from(prizes);
  if (existingPrizes.length === 0) {
    await db.insert(prizes).values([
      { playType: "directo", firstPrizeMultiplier: "50.00", secondPrizeMultiplier: "15.00", thirdPrizeMultiplier: "10.00", paleFirstSecondMultiplier: "0.00", paleFirstThirdMultiplier: "0.00", paleSecondThirdMultiplier: "0.00", fixedMultiplier: "0.00", description: "1er premio=50x, 2do=15x, 3ro=10x por euro" },
      { playType: "pale", firstPrizeMultiplier: "0.00", secondPrizeMultiplier: "0.00", thirdPrizeMultiplier: "0.00", paleFirstSecondMultiplier: "25.00", paleFirstThirdMultiplier: "20.00", paleSecondThirdMultiplier: "15.00", fixedMultiplier: "0.00", description: "1er+2do=25x, 1er+3ro=20x, 2do+3ro=15x por euro" },
      { playType: "terna", firstPrizeMultiplier: "0.00", secondPrizeMultiplier: "0.00", thirdPrizeMultiplier: "0.00", paleFirstSecondMultiplier: "0.00", paleFirstThirdMultiplier: "0.00", paleSecondThirdMultiplier: "0.00", fixedMultiplier: "500.00", description: "3 cifras = 500x por euro" },
      { playType: "cuatrena", firstPrizeMultiplier: "0.00", secondPrizeMultiplier: "0.00", thirdPrizeMultiplier: "0.00", paleFirstSecondMultiplier: "0.00", paleFirstThirdMultiplier: "0.00", paleSecondThirdMultiplier: "0.00", fixedMultiplier: "4000.00", description: "4 cifras = 4,000x por euro" },
      { playType: "tripleta", firstPrizeMultiplier: "0.00", secondPrizeMultiplier: "0.00", thirdPrizeMultiplier: "0.00", paleFirstSecondMultiplier: "0.00", paleFirstThirdMultiplier: "0.00", paleSecondThirdMultiplier: "0.00", fixedMultiplier: "10000.00", description: "Tripleta = 10,000x por euro" },
    ]);
    console.log("Default prizes seeded");
  } else {
    console.log("Prizes already exist:", existingPrizes.length);
  }

  console.log("Database sync and seed complete!");
  process.exit(0);
}

syncAndSeed().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
