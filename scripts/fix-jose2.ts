import "dotenv/config";
import mysql from "mysql2/promise";

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // The DB server applies a +4hr offset when storing (EDT timezone).
  // clockIn stored as 2026-03-31T17:30:00.000Z but was inserted as local time.
  // To get 9h 30m (570 minutes) from clockIn 17:30, clockOut should be 03:00 next day in UTC display.
  // But the DB added 4 hours. So I need to subtract 4 hours from my target.
  // Target UTC display: 2026-04-01T03:00:00Z
  // I need to insert: 2026-03-31 23:00:00 (which the DB will store as 2026-04-01T03:00:00Z)
  
  const correctClockOut = "2026-03-31 23:00:00";
  
  console.log("Fixing Jose entry 600015 (accounting for DB timezone):");
  console.log("  Target: clockOut = 2026-04-01T03:00:00Z (9h 30m from clockIn)");
  console.log("  Inserting: " + correctClockOut + " (DB will add +4hr EDT offset)");
  
  const [result] = await conn.query(
    "UPDATE clockEntries SET clockOut = ? WHERE id = 600015",
    [correctClockOut]
  ) as any[];
  
  console.log("  Updated:", result.affectedRows, "row(s)");
  
  // Verify
  const [verify] = await conn.query(
    "SELECT id, clockIn, clockOut, TIMESTAMPDIFF(MINUTE, clockIn, clockOut) as minutes FROM clockEntries WHERE id = 600015"
  );
  console.log("\nVerification:");
  console.table(verify);
  
  await conn.end();
}
run();
