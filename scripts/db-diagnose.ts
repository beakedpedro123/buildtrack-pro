import "dotenv/config";
import mysql from "mysql2/promise";

async function diagnose() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);

  console.log("=== CURRENT EMPLOYEES ===");
  const [employees] = await conn.query("SELECT id, name, role, isActive FROM employees ORDER BY id");
  console.table(employees);

  console.log("\n=== CLOCK ENTRIES (last 50) ===");
  const [clockEntries] = await conn.query(`
    SELECT ce.id, ce.employeeId, e.name as employeeName, ce.jobId, j.name as jobName, 
           ce.clockIn, ce.clockOut
    FROM clockEntries ce
    LEFT JOIN employees e ON ce.employeeId = e.id
    LEFT JOIN jobs j ON ce.jobId = j.id
    ORDER BY ce.clockIn DESC
    LIMIT 50
  `);
  console.table(clockEntries);

  console.log("\n=== ORPHANED CLOCK ENTRIES (no matching employee) ===");
  const [orphaned] = await conn.query(`
    SELECT ce.id, ce.employeeId, ce.jobId, ce.clockIn, ce.clockOut, ce.notes
    FROM clockEntries ce
    LEFT JOIN employees e ON ce.employeeId = e.id
    WHERE e.id IS NULL
    ORDER BY ce.clockIn DESC
  `);
  console.table(orphaned);
  console.log(`Total orphaned entries: ${(orphaned as any[]).length}`);

  console.log("\n=== DISTINCT employeeId values in clockEntries ===");
  const [distinctIds] = await conn.query(`
    SELECT DISTINCT ce.employeeId, e.name as currentEmployeeName
    FROM clockEntries ce
    LEFT JOIN employees e ON ce.employeeId = e.id
    ORDER BY ce.employeeId
  `);
  console.table(distinctIds);

  console.log("\n=== ORPHANED in other tables ===");
  
  const [orphanedAssignments] = await conn.query(`
    SELECT ja.id, ja.employeeId, ja.jobId
    FROM jobAssignments ja
    LEFT JOIN employees e ON ja.employeeId = e.id
    WHERE e.id IS NULL
  `);
  console.log(`Orphaned job assignments: ${(orphanedAssignments as any[]).length}`);

  const [orphanedAdjustments] = await conn.query(`
    SELECT ta.id, ta.clockEntryId, ta.adjustedBy
    FROM timeAdjustments ta
    LEFT JOIN employees e ON ta.adjustedBy = e.id
    WHERE e.id IS NULL
  `);
  console.log(`Orphaned time adjustments: ${(orphanedAdjustments as any[]).length}`);

  const [orphanedPivot] = await conn.query(`
    SELECT pm.id, pm.employeeId
    FROM pivotMemory pm
    LEFT JOIN employees e ON pm.employeeId = e.id
    WHERE e.id IS NULL
  `);
  console.log(`Orphaned pivot memory: ${(orphanedPivot as any[]).length}`);

  await conn.end();
}

diagnose().catch(console.error);
