import "dotenv/config";
import mysql from "mysql2/promise";

async function fixJobIds() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

  const conn = await mysql.createConnection(url);
  const dryRun = process.argv.includes("--dry-run");

  console.log(`=== JOB ID FIX (${dryRun ? "DRY RUN" : "LIVE"}) ===\n`);

  // Mapping: old orphaned job ID -> correct current job ID
  const jobMapping: Record<number, number> = {
    60001: 1,  // Unit 39
    60002: 2,  // Unit 125, unit 126
    60003: 3,  // Rickys deck
    60004: 4,  // Swanson cabin
    60005: 5,  // Hyde
    60006: 6,  // The chateaux porte corte chochere
    90001: 7,  // Morgan D12
  };

  // Job names for logging
  const jobNames: Record<number, string> = {
    1: "Unit 39",
    2: "Unit 125, unit 126",
    3: "Rickys deck",
    4: "Swanson cabin",
    5: "Hyde",
    6: "The chateaux porte corte chochere",
    7: "Morgan D12",
  };

  let totalUpdated = 0;

  for (const [oldIdStr, newId] of Object.entries(jobMapping)) {
    const oldId = parseInt(oldIdStr);
    
    // Count entries with this old ID
    const [countResult] = await conn.query(
      "SELECT COUNT(*) as cnt FROM clockEntries WHERE jobId = ?",
      [oldId]
    ) as any[];
    const count = countResult[0].cnt;

    if (count === 0) {
      console.log(`  jobId ${oldId} -> ${newId} (${jobNames[newId]}): no entries to update`);
      continue;
    }

    console.log(`  jobId ${oldId} -> ${newId} (${jobNames[newId]}): ${count} entries`);

    if (!dryRun) {
      await conn.query(
        "UPDATE clockEntries SET jobId = ? WHERE jobId = ?",
        [newId, oldId]
      );
      console.log(`    ✅ Updated ${count} entries`);
    } else {
      console.log(`    [DRY RUN] Would update ${count} entries`);
    }

    totalUpdated += count;
  }

  // Handle jobId=0 entries - these are "Job #0" / unassigned
  const [zeroCount] = await conn.query(
    "SELECT COUNT(*) as cnt FROM clockEntries WHERE jobId = 0"
  ) as any[];
  const zeroEntries = (zeroCount as any[])[0].cnt;
  console.log(`\n  jobId 0 (unassigned/Job #0): ${zeroEntries} entries - keeping as-is`);

  // Also fix dailyReports if they have orphaned job IDs
  console.log("\n--- Checking dailyReports ---");
  for (const [oldIdStr, newId] of Object.entries(jobMapping)) {
    const oldId = parseInt(oldIdStr);
    const [countResult] = await conn.query(
      "SELECT COUNT(*) as cnt FROM dailyReports WHERE jobId = ?",
      [oldId]
    ) as any[];
    const count = countResult[0].cnt;
    if (count > 0) {
      console.log(`  dailyReports jobId ${oldId} -> ${newId} (${jobNames[newId]}): ${count} reports`);
      if (!dryRun) {
        await conn.query("UPDATE dailyReports SET jobId = ? WHERE jobId = ?", [newId, oldId]);
        console.log(`    ✅ Updated ${count} reports`);
      }
    }
  }

  // Also fix budgets if they have orphaned job IDs
  console.log("\n--- Checking budgets ---");
  try {
    for (const [oldIdStr, newId] of Object.entries(jobMapping)) {
      const oldId = parseInt(oldIdStr);
      const [countResult] = await conn.query(
        "SELECT COUNT(*) as cnt FROM budgets WHERE jobId = ?",
        [oldId]
      ) as any[];
      const count = countResult[0].cnt;
      if (count > 0) {
        console.log(`  budgets jobId ${oldId} -> ${newId} (${jobNames[newId]}): ${count} budgets`);
        if (!dryRun) {
          await conn.query("UPDATE budgets SET jobId = ? WHERE jobId = ?", [newId, oldId]);
          console.log(`    ✅ Updated ${count} budgets`);
        }
      }
    }
  } catch (e: any) {
    console.log(`  (budgets table check skipped: ${e.message})`);
  }

  // Also fix photos if they have orphaned job IDs
  console.log("\n--- Checking photos ---");
  try {
    for (const [oldIdStr, newId] of Object.entries(jobMapping)) {
      const oldId = parseInt(oldIdStr);
      const [countResult] = await conn.query(
        "SELECT COUNT(*) as cnt FROM photos WHERE jobId = ?",
        [oldId]
      ) as any[];
      const count = countResult[0].cnt;
      if (count > 0) {
        console.log(`  photos jobId ${oldId} -> ${newId} (${jobNames[newId]}): ${count} photos`);
        if (!dryRun) {
          await conn.query("UPDATE photos SET jobId = ? WHERE jobId = ?", [newId, oldId]);
          console.log(`    ✅ Updated ${count} photos`);
        }
      }
    }
  } catch (e: any) {
    console.log(`  (photos table check skipped: ${e.message})`);
  }

  console.log(`\n=== TOTAL: ${totalUpdated} clock entries to remap ===`);

  // Verify: check for any remaining orphaned job IDs
  if (!dryRun) {
    const [remaining] = await conn.query(`
      SELECT DISTINCT ce.jobId, COUNT(*) as cnt
      FROM clockEntries ce
      LEFT JOIN jobs j ON ce.jobId = j.id
      WHERE j.id IS NULL AND ce.jobId != 0
      GROUP BY ce.jobId
    `) as any[];
    
    if ((remaining as any[]).length === 0) {
      console.log("\n✅ SUCCESS: No orphaned job IDs remaining (except jobId=0 which is intentional)");
    } else {
      console.log("\n⚠️  Still orphaned:");
      console.table(remaining);
    }
  }

  await conn.end();
}

fixJobIds().catch(console.error);
