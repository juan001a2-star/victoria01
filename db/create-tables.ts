import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no está definida");
  process.exit(1);
}

const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const client = new pg.Client({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// Crea únicamente las tablas que no existan.
// No elimina tablas ni borra registros.
const statements = [
  `CREATE TABLE IF NOT EXISTS auth_users (
    id SERIAL PRIMARY KEY,
    "unionId" VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    email VARCHAR(320),
    avatar TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    max_sales_per_day NUMERIC(12,2) DEFAULT '50000.00',
    play_limit_directo INTEGER DEFAULT 1000,
    play_limit_pale INTEGER DEFAULT 500,
    play_limit_tripleta INTEGER DEFAULT 300,
    play_limit_cuatrena INTEGER DEFAULT 200,
    play_limit_terna INTEGER DEFAULT 200,
    enable_directo BOOLEAN DEFAULT true,
    enable_pale BOOLEAN DEFAULT true,
    enable_tripleta BOOLEAN DEFAULT true,
    enable_cuatrena BOOLEAN DEFAULT true,
    enable_terna BOOLEAN DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS lottery_users (
    id SERIAL PRIMARY KEY,
    bank_number VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    lottery_role VARCHAR(20) NOT NULL DEFAULT 'user',
    group_id BIGINT REFERENCES groups(id),
    credit NUMERIC(12,2) NOT NULL DEFAULT '500.00',
    commission NUMERIC(5,2) NOT NULL DEFAULT '10.00',
    active BOOLEAN NOT NULL DEFAULT true,
    language VARCHAR(5) NOT NULL DEFAULT 'es',
    fingerprint_token VARCHAR(128),
    bound_device_id VARCHAR(128),
    bound_device_label VARCHAR(120),
    bound_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS lotteries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    draw_time VARCHAR(10) NOT NULL DEFAULT '12:00',
    open_time VARCHAR(10) NOT NULL DEFAULT '06:00',
    close_time VARCHAR(10) NOT NULL DEFAULT '11:00',
    schedule TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS winners (
    id SERIAL PRIMARY KEY,
    lottery_id BIGINT NOT NULL REFERENCES lotteries(id),
    first_prize VARCHAR(10) NOT NULL,
    second_prize VARCHAR(10) NOT NULL,
    third_prize VARCHAR(10) NOT NULL,
    draw_date VARCHAR(15) NOT NULL,
    created_by BIGINT REFERENCES lottery_users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES lottery_users(id),
    updated_at TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL REFERENCES lottery_users(id),
    lottery_id BIGINT NOT NULL REFERENCES lotteries(id),
    total NUMERIC(10,2) NOT NULL DEFAULT '0.00',
    commission NUMERIC(5,2) NOT NULL DEFAULT '10.00',
    net_deduction NUMERIC(10,2) NOT NULL DEFAULT '0.00',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    annulled_by BIGINT REFERENCES lottery_users(id),
    annulled_at TIMESTAMP,
    winner_id BIGINT REFERENCES winners(id),
    prize_amount NUMERIC(12,2),
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS plays (
    id SERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES tickets(id),
    number VARCHAR(50) NOT NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT '0.00',
    play_type VARCHAR(20) NOT NULL DEFAULT 'directo',
    lottery_id BIGINT NOT NULL REFERENCES lotteries(id),
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS prizes (
    id SERIAL PRIMARY KEY,
    play_type VARCHAR(20) NOT NULL,
    first_prize_multiplier NUMERIC(10,2) DEFAULT '50.00',
    second_prize_multiplier NUMERIC(10,2) DEFAULT '15.00',
    third_prize_multiplier NUMERIC(10,2) DEFAULT '10.00',
    pale_first_second NUMERIC(10,2) DEFAULT '25.00',
    pale_first_third NUMERIC(10,2) DEFAULT '0.00',
    pale_second_third NUMERIC(10,2) DEFAULT '0.00',
    fixed_multiplier NUMERIC(12,2) DEFAULT '0.00',
    description VARCHAR(255),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS play_limits (
    id SERIAL PRIMARY KEY,
    lottery_id BIGINT NOT NULL REFERENCES lotteries(id),
    play_type VARCHAR(20) NOT NULL,
    number_combo VARCHAR(50) NOT NULL,
    max_amount NUMERIC(10,2) NOT NULL DEFAULT '0.00',
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS credit_adjustments (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES lottery_users(id),
    adjusted_by BIGINT NOT NULL REFERENCES lottery_users(id),
    type VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL DEFAULT 'add',
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    note VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
];

async function main() {
  console.log("create-tables: conectando a PostgreSQL...");
  await client.connect();

  try {
    await client.query("BEGIN");
    for (const sql of statements) {
      await client.query(sql);
    }
    await client.query("COMMIT");
    console.log("create-tables: las 11 tablas existen o fueron creadas.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("create-tables falló:", error);
  process.exit(1);
});
