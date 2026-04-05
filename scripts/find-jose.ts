import "dotenv/config";
import mysql from "mysql2/promise";

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [entries] = await conn.query(
    "SELECT id, clockIn, clockOut, jobId, TIMESTAMPDIFF(MINUTE, clockIn, clockOut) as minutes FROM clockEntries WHERE employeeId = 8 ORDER BY clockIn"
  );
  console.log("Jose Marquina (ID 8) clock entries:");
  console.table(entries);
  await conn.end();
}
run();
