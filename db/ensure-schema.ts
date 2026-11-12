/**
 * Asegura columnas nuevas sin depender de drizzle-kit push (falla a menudo en Render).
 * Seguro de ejecutar varias veces (IF NOT EXISTS).
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no definida");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes("localhost") || url.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
});

async function main() {
  console.log("ensure-schema: conectando...");
  await client.connect();

  const statements = [
    `ALTER TABLE lottery_users ADD COLUMN IF NOT EXISTS fingerprint_token varchar(128)`,
    `ALTER TABLE lottery_users ADD COLUMN IF NOT EXISTS bound_device_id varchar(128)`,
    `ALTER TABLE lottery_users ADD COLUMN IF NOT EXISTS bound_device_label varchar(120)`,
    `ALTER TABLE lottery_users ADD COLUMN IF NOT EXISTS bound_at timestamp`,
    `ALTER TABLE lottery_users ADD COLUMN IF NOT EXISTS language varchar(5) DEFAULT 'es'`,
  ];

  for (const sql of statements) {
    try {
      await client.query(sql);
      console.log("OK:", sql.slice(0, 70));
    } catch (err: any) {
      // No abortar el arranque por una columna ya existente o tabla ausente temporal
      console.warn("WARN:", sql.slice(0, 50), "->", err?.message || err);
    }
  }

  await client.end();
  console.log("ensure-schema: listo");
}

main().catch((err) => {
  console.error("ensure-schema fallo:", err);
  process.exit(1);
});
