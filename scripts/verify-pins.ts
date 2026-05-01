import "./load-env.js";
import mysql from "mysql2/promise";

async function check() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute("SELECT id, name, LEFT(pin, 10) as pin_prefix FROM employees WHERE pin IS NOT NULL LIMIT 5") as any;
  console.log("Sample PINs (first 10 chars):");
  rows.forEach((r: any) => console.log("  ", r.name, "->", r.pin_prefix));
  await conn.end();
}
check();
