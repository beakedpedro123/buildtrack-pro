import "dotenv/config";
import mysql from "mysql2/promise";

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // Jose's entry 600015: clockOut is April 2 03:00 UTC but should be April 1 05:00 UTC
  // PDF says: Tue, Mar 31 -> 1:30 PM to 11:00 PM MDT (Unit 39) = 9h 30m
  // MDT is UTC-6, so 11:00 PM MDT = 05:00 UTC next day (April 1)
  // But the DB appears to be in EDT (UTC-4), so let's check:
  // clockIn is 2026-03-31T17:30:00 which in MDT would be 11:30 AM - but PDF says 1:30 PM
  // So the DB is storing in EDT: 1:30 PM MDT = 3:30 PM EDT = 17:30 in 24hr... wait
  // Actually 1:30 PM MDT = 7:30 PM UTC = 3:30 PM EDT... no
  // MDT = UTC-6. 1:30 PM MDT = 19:30 UTC
  // EDT = UTC-4. 19:30 UTC = 3:30 PM EDT
  // But DB shows 17:30 = 5:30 PM... 
  // Let me check: the DB stores raw timestamps. The app converts.
  // PDF shows 1:30 PM (which is MDT). DB has 17:30 UTC.
  // 1:30 PM MDT = 13:30 MDT = 13:30 + 6 = 19:30 UTC... but DB shows 17:30
  // So maybe the app stores local time directly (no timezone conversion)?
  // If DB stores MDT directly: clockIn 17:30 = 5:30 PM, not 1:30 PM
  // Unless the DB is storing in a different format...
  
  // Let me just look at what the PDF says and match the pattern:
  // Entry 510001: clockIn 19:24:55, clockOut 03:22:02 next day
  // PDF: Mon Mar 30, Jose: 3:24 PM to 11:22 PM = 7h 57m
  // 19:24 in 24hr = 7:24 PM... but PDF says 3:24 PM
  // 19:24 - 4 = 15:24 = 3:24 PM EDT. So DB is in UTC and app converts to EDT?
  // Wait, user is in MDT (UTC-6). 19:24 UTC = 1:24 PM MDT. But PDF says 3:24 PM.
  // 19:24 - 4 = 15:24 = 3:24 PM. So the display is EDT (UTC-4)?
  // No, the app must be using the browser/device timezone.
  // Regardless, the fix: PDF says Jose worked 1:30 PM to 11:00 PM on Mar 31 = 9h 30m
  
  // The clockIn is 2026-03-31T17:30:00 UTC
  // 9h 30m later = 2026-04-01T03:00:00 UTC
  // Current clockOut = 2026-04-02T03:00:00 UTC (off by exactly 24 hours!)
  
  const correctClockOut = "2026-04-01 03:00:00";
  
  console.log("Fixing Jose entry 600015:");
  console.log("  Current clockOut: 2026-04-02 03:00:00 (33h 30m)");
  console.log("  Correct clockOut: " + correctClockOut + " (9h 30m)");
  
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
