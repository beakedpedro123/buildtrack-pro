import "dotenv/config";
import mysql from "mysql2/promise";

// From the PDF payroll report, we have exact clock-in/clock-out times for each employee.
// We'll match these against the orphaned clock entries in the DB to determine which old employeeId
// belongs to which current employee.

// Current employee IDs (from the DB):
const CURRENT_EMPLOYEES: Record<string, number> = {
  "Pedro": 1,
  "Ricardo Ocampo": 2,
  "Juan Melgoza": 3,
  "Pablo Carranza": 4,
  "Lupe Mejia": 5,
  "Demetrio": 6,
  "Elias Bonilla": 7,
  "Jose marquina": 8,
  "Alberto mendoza": 9,
  "Reed mccluskey": 10,
  "David lopez": 11,
  "Javier leyva": 12,
  "Vicente camacho": 13,
  "Jesus bonilla": 14,
  "Merlin diaz": 15,
  "Isidrio ruiz": 16,
  "Carlos hernandez": 17,
  "Luis Hernandez": 18,
  "Francisco Flores": 19, // may not exist in DB anymore
};

// From the PDF, unique clock-in times per employee (using first entry as fingerprint)
// We'll use the exact clockIn timestamp to match
// PDF times are in MDT (UTC-6), DB stores in UTC
// Mon Mar 30 01:30 PM MDT = Mon Mar 30 19:30 UTC
// Offset: +6 hours from MDT to UTC

interface ClockFingerprint {
  employeeName: string;
  newId: number;
  // First clock-in entry from the PDF (converted to approximate UTC)
  clockInApprox: string; // ISO date string in UTC
  jobName: string;
}

// Key entries from PDF to use as fingerprints for matching
// Using the FIRST clock entry for each employee
const fingerprints: ClockFingerprint[] = [
  // Pablo Carranza: Mon Mar 30, 01:30 PM MDT -> 19:30 UTC, chateaux
  { employeeName: "Pablo Carranza", newId: 4, clockInApprox: "2026-03-30T19:30", jobName: "chateaux" },
  // Juan Melgoza: Tue Mar 31, 02:03 PM MDT -> 20:03 UTC, Unit 125
  { employeeName: "Juan Melgoza", newId: 3, clockInApprox: "2026-03-31T20:03", jobName: "Unit 125" },
  // Ricardo Ocampo: Mon Mar 30, 03:25 PM MDT -> 21:25 UTC, Unit 39
  { employeeName: "Ricardo Ocampo", newId: 2, clockInApprox: "2026-03-30T21:25", jobName: "Unit 39" },
  // Carlos hernandez: Mon Mar 30, 03:26 PM MDT -> 21:26 UTC, Rickys deck
  { employeeName: "Carlos hernandez", newId: 17, clockInApprox: "2026-03-30T21:26", jobName: "Rickys" },
  // David lopez: Mon Mar 30, 01:25 PM MDT -> 19:25 UTC, Job #0
  { employeeName: "David lopez", newId: 11, clockInApprox: "2026-03-30T19:25", jobName: "Job" },
  // Demetrio: Mon Mar 30, 04:35 AM MDT -> 10:35 UTC, Job #0 (but 0h), then 01:35 PM -> 19:35 UTC
  { employeeName: "Demetrio", newId: 6, clockInApprox: "2026-03-30T19:35", jobName: "Unit 125" },
  // Elias Bonilla: Mon Mar 30, 02:00 PM MDT -> 20:00 UTC, Unit 39
  { employeeName: "Elias Bonilla", newId: 7, clockInApprox: "2026-03-30T20:00", jobName: "Unit 39" },
  // Francisco Flores: Mon Mar 30, 01:32 PM MDT -> 19:32 UTC, Job #0
  { employeeName: "Francisco Flores", newId: 19, clockInApprox: "2026-03-30T19:32", jobName: "Job" },
  // Isidrio ruiz: Mon Mar 30, 01:31 PM MDT -> 19:31 UTC, Hyde
  { employeeName: "Isidrio ruiz", newId: 16, clockInApprox: "2026-03-30T19:31", jobName: "Hyde" },
  // Javier leyva: Mon Mar 30, 02:08 PM MDT -> 20:08 UTC, Unit 125
  { employeeName: "Javier leyva", newId: 12, clockInApprox: "2026-03-30T20:08", jobName: "Unit 125" },
  // Jesus bonilla: Mon Mar 30, 03:26 PM MDT -> 21:26 UTC, Hyde
  { employeeName: "Jesus bonilla", newId: 14, clockInApprox: "2026-03-30T21:26", jobName: "Hyde" },
  // Jose marquina: Mon Mar 30, 03:24 PM MDT -> 21:24 UTC, Unit 39
  { employeeName: "Jose marquina", newId: 8, clockInApprox: "2026-03-30T21:24", jobName: "Unit 39" },
  // Luis Hernandez: Mon Mar 30, 02:10 PM MDT -> 20:10 UTC, Unit 39
  { employeeName: "Luis Hernandez", newId: 18, clockInApprox: "2026-03-30T20:10", jobName: "Unit 39" },
  // Merlin diaz: Mon Mar 30, 01:33 PM MDT -> 19:33 UTC, Unit 125
  { employeeName: "Merlin diaz", newId: 15, clockInApprox: "2026-03-30T19:33", jobName: "Unit 125" },
  // Reed mccluskey: Mon Mar 30, 02:25 PM MDT -> 20:25 UTC, Unit 39
  { employeeName: "Reed mccluskey", newId: 10, clockInApprox: "2026-03-30T20:25", jobName: "Unit 39" },
  // Vicente camacho: Mon Mar 30, 01:58 PM MDT -> 19:58 UTC, Unit 125
  { employeeName: "Vicente camacho", newId: 13, clockInApprox: "2026-03-30T19:58", jobName: "Unit 125" },
];

async function matchAndFix() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);

  // Get all orphaned clock entries with their job names
  const [orphaned] = await conn.query(`
    SELECT ce.id, ce.employeeId, ce.clockIn, ce.clockOut, ce.jobId, j.name as jobName
    FROM clockEntries ce
    LEFT JOIN employees e ON ce.employeeId = e.id
    LEFT JOIN jobs j ON ce.jobId = j.id
    WHERE e.id IS NULL
    ORDER BY ce.clockIn ASC
  `) as any[];

  console.log(`Found ${orphaned.length} orphaned clock entries`);

  // Build mapping: old employeeId -> new employeeId
  const idMapping: Record<number, { newId: number; employeeName: string; confidence: string }> = {};

  for (const fp of fingerprints) {
    const fpTime = new Date(fp.clockInApprox);
    
    // Find matching orphaned entry (within 5 minute window)
    for (const entry of orphaned) {
      const entryTime = new Date(entry.clockIn);
      const diffMinutes = Math.abs(entryTime.getTime() - fpTime.getTime()) / 60000;
      
      if (diffMinutes <= 5 && !idMapping[entry.employeeId]) {
        idMapping[entry.employeeId] = {
          newId: fp.newId,
          employeeName: fp.employeeName,
          confidence: diffMinutes <= 1 ? "HIGH" : "MEDIUM"
        };
        console.log(`MATCH: Old ID ${entry.employeeId} -> ${fp.employeeName} (new ID ${fp.newId}) [${diffMinutes.toFixed(1)} min diff, ${idMapping[entry.employeeId].confidence}]`);
        break;
      }
    }
  }

  // Also check: old ID 100 - need to find what it maps to
  // Check entries with employeeId=100
  const [id100entries] = await conn.query(`
    SELECT ce.id, ce.employeeId, ce.clockIn, ce.clockOut, ce.jobId, j.name as jobName
    FROM clockEntries ce
    LEFT JOIN jobs j ON ce.jobId = j.id
    WHERE ce.employeeId = 100
  `) as any[];
  
  if ((id100entries as any[]).length > 0) {
    console.log("\n=== Entries with employeeId=100 ===");
    console.table(id100entries);
  }

  console.log("\n=== FINAL MAPPING ===");
  console.table(idMapping);

  // Check for unmapped old IDs
  const allOldIds = new Set((orphaned as any[]).map((e: any) => e.employeeId));
  const mappedIds = new Set(Object.keys(idMapping).map(Number));
  const unmapped = [...allOldIds].filter(id => !mappedIds.has(id));
  if (unmapped.length > 0) {
    console.log("\n=== UNMAPPED OLD IDs ===", unmapped);
    for (const uid of unmapped) {
      const entries = orphaned.filter((e: any) => e.employeeId === uid);
      console.log(`\nOld ID ${uid} has ${entries.length} entries:`);
      console.table(entries.map((e: any) => ({
        clockIn: e.clockIn,
        clockOut: e.clockOut,
        jobName: e.jobName
      })));
    }
  }

  // Ask for confirmation before applying
  const dryRun = process.argv.includes("--dry-run");
  
  if (dryRun) {
    console.log("\n=== DRY RUN - No changes made ===");
    console.log("Run without --dry-run to apply changes");
  } else {
    console.log("\n=== APPLYING FIXES ===");
    
    for (const [oldId, mapping] of Object.entries(idMapping)) {
      const [result] = await conn.query(
        `UPDATE clockEntries SET employeeId = ? WHERE employeeId = ?`,
        [mapping.newId, Number(oldId)]
      ) as any[];
      console.log(`Updated clockEntries: old ID ${oldId} -> new ID ${mapping.newId} (${mapping.employeeName}): ${result.affectedRows} rows`);
    }

    // Also fix pivotMemory
    for (const [oldId, mapping] of Object.entries(idMapping)) {
      const [result] = await conn.query(
        `UPDATE pivotMemory SET employeeId = ? WHERE employeeId = ?`,
        [mapping.newId, Number(oldId)]
      ) as any[];
      if (result.affectedRows > 0) {
        console.log(`Updated pivotMemory: old ID ${oldId} -> new ID ${mapping.newId}: ${result.affectedRows} rows`);
      }
    }

    // Also fix timeAdjustments.adjustedBy
    for (const [oldId, mapping] of Object.entries(idMapping)) {
      const [result] = await conn.query(
        `UPDATE timeAdjustments SET adjustedBy = ? WHERE adjustedBy = ?`,
        [mapping.newId, Number(oldId)]
      ) as any[];
      if (result.affectedRows > 0) {
        console.log(`Updated timeAdjustments.adjustedBy: old ID ${oldId} -> new ID ${mapping.newId}: ${result.affectedRows} rows`);
      }
    }

    console.log("\n=== DONE! Verifying... ===");
    
    // Verify no more orphans
    const [remaining] = await conn.query(`
      SELECT COUNT(*) as count FROM clockEntries ce
      LEFT JOIN employees e ON ce.employeeId = e.id
      WHERE e.id IS NULL
    `) as any[];
    console.log(`Remaining orphaned clock entries: ${remaining[0].count}`);
  }

  await conn.end();
}

matchAndFix().catch(console.error);
