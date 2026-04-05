import "dotenv/config";
import mysql from "mysql2/promise";

async function check() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  const [tz] = await conn.query("SELECT @@session.time_zone as session_tz, @@global.time_zone as global_tz") as any[];
  console.log("DB timezone:", tz);
  
  // Reed=10 from PDF: Mon Mar 30, 02:25 PM MDT clockIn
  // Jesus=14 from PDF: Mon Mar 30, 03:26 PM MDT clockIn
  const [samples] = await conn.query("SELECT employeeId, clockIn, clockOut FROM clockEntries WHERE employeeId IN (10, 14) ORDER BY clockIn LIMIT 6") as any[];
  console.log("\nKnown entries (Reed=10, Jesus=14):");
  for (const s of samples as any[]) {
    const d = new Date(s.clockIn);
    console.log(`  empId=${s.employeeId} clockIn=${s.clockIn} (UTC ISO: ${d.toISOString()})`);
  }

  // Get ALL orphaned entries with their raw timestamps
  const [orphans] = await conn.query(`
    SELECT ce.employeeId, ce.clockIn, ce.clockOut
    FROM clockEntries ce
    LEFT JOIN employees e ON ce.employeeId = e.id
    WHERE e.id IS NULL
    ORDER BY ce.employeeId, ce.clockIn
  `) as any[];
  
  console.log("\nAll orphaned entries:");
  for (const o of orphans as any[]) {
    const d = new Date(o.clockIn);
    console.log(`  oldId=${o.employeeId} clockIn_raw=${o.clockIn} clockIn_UTC=${d.toISOString()}`);
  }

  await conn.end();
}

check().catch(console.error);
