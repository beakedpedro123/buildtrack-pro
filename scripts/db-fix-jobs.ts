import "dotenv/config";
import mysql from "mysql2/promise";

async function diagnoseAndFixJobs() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

  const conn = await mysql.createConnection(url);
  const dryRun = process.argv.includes("--dry-run");

  console.log("=== JOB ID DIAGNOSIS ===\n");

  // Step 1: Get current jobs
  const [jobs] = await conn.query("SELECT id, name, address FROM jobs ORDER BY id") as any[];
  console.log("Current jobs:");
  console.table(jobs);

  // Step 2: Find all unique jobId values in clockEntries
  const [clockJobIds] = await conn.query(`
    SELECT DISTINCT ce.jobId, j.name as jobName
    FROM clockEntries ce
    LEFT JOIN jobs j ON ce.jobId = j.id
    ORDER BY ce.jobId
  `) as any[];
  console.log("\nJob IDs referenced in clockEntries:");
  console.table(clockJobIds);

  // Step 3: Find orphaned job IDs (in clockEntries but not in jobs table)
  const [orphanedJobs] = await conn.query(`
    SELECT DISTINCT ce.jobId, COUNT(*) as entryCount
    FROM clockEntries ce
    LEFT JOIN jobs j ON ce.jobId = j.id
    WHERE j.id IS NULL AND ce.jobId IS NOT NULL
    GROUP BY ce.jobId
    ORDER BY ce.jobId
  `) as any[];
  console.log("\nOrphaned job IDs (in clockEntries but no matching job):");
  console.table(orphanedJobs);

  // Step 4: For each orphaned job ID, show the clock entries with employee names
  for (const orphan of orphanedJobs as any[]) {
    const [entries] = await conn.query(`
      SELECT ce.jobId, ce.clockIn, ce.clockOut, e.name as employeeName, ce.jobName as storedJobName
      FROM clockEntries ce
      LEFT JOIN employees e ON ce.employeeId = e.id
      WHERE ce.jobId = ?
      ORDER BY ce.clockIn
    `, [orphan.jobId]) as any[];
    console.log(`\nOrphaned jobId=${orphan.jobId} entries:`);
    for (const e of entries as any[]) {
      const cin = new Date(e.clockIn);
      console.log(`  ${e.employeeName || 'unknown'} | clockIn: ${cin.toISOString()} | storedJobName: ${e.storedJobName || 'null'}`);
    }
  }

  // Step 5: Check if clockEntries has a jobName text column that might help identify jobs
  const [columns] = await conn.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'clockEntries' AND COLUMN_NAME LIKE '%job%'
  `) as any[];
  console.log("\nJob-related columns in clockEntries:");
  console.table(columns);

  // Step 6: Check dailyReports for orphaned job IDs too
  const [reportOrphans] = await conn.query(`
    SELECT DISTINCT dr.jobId, COUNT(*) as reportCount
    FROM dailyReports dr
    LEFT JOIN jobs j ON dr.jobId = j.id
    WHERE j.id IS NULL AND dr.jobId IS NOT NULL
    GROUP BY dr.jobId
    ORDER BY dr.jobId
  `) as any[];
  console.log("\nOrphaned job IDs in dailyReports:");
  console.table(reportOrphans);

  // Step 7: Check budgets for orphaned job IDs
  const [budgetOrphans] = await conn.query(`
    SELECT DISTINCT b.jobId, COUNT(*) as budgetCount
    FROM budgets b
    LEFT JOIN jobs j ON b.jobId = j.id
    WHERE j.id IS NULL AND b.jobId IS NOT NULL
    GROUP BY b.jobId
    ORDER BY b.jobId
  `) as any[];
  console.log("\nOrphaned job IDs in budgets:");
  console.table(budgetOrphans);

  await conn.end();
}

diagnoseAndFixJobs().catch(console.error);
