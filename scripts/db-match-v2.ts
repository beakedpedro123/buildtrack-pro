import "dotenv/config";
import mysql from "mysql2/promise";

// PDF data: each employee's clock entries with times converted to UTC (MDT + 6 hours)
// We'll match by finding the orphaned old employeeId whose clock entries best match the PDF times

interface PdfEntry {
  clockInUTC: string;
  clockOutUTC: string;
}

interface EmployeePdfData {
  name: string;
  newId: number;
  entries: PdfEntry[];
}

// Convert MDT times from PDF to UTC by adding 6 hours
// Format: "YYYY-MM-DD HH:MM" in MDT -> UTC
function mdtToUtc(date: string, time: string): string {
  // time is like "01:30 PM" or "04:34 AM"
  const [timePart, ampm] = time.split(" ");
  let [hours, minutes] = timePart.split(":").map(Number);
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  // Create date in MDT then convert to UTC by adding 6 hours
  const baseDate = new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`);
  baseDate.setUTCHours(baseDate.getUTCHours() + 6);
  return baseDate.toISOString();
}

const employees: EmployeePdfData[] = [
  {
    name: "Pablo Carranza", newId: 4,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "01:30 PM"), clockOutUTC: mdtToUtc("2026-03-31", "04:34 AM") },
      { clockInUTC: mdtToUtc("2026-03-31", "05:06 AM"), clockOutUTC: mdtToUtc("2026-03-31", "05:07 AM") },
    ]
  },
  {
    name: "Juan Melgoza", newId: 3,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-31", "02:03 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:10 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:49 PM"), clockOutUTC: mdtToUtc("2026-04-03", "11:31 PM") },
    ]
  },
  {
    name: "Ricardo Ocampo", newId: 2,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "03:25 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:03 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "02:01 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:05 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:33 PM"), clockOutUTC: mdtToUtc("2026-04-03", "01:34 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "04:49 PM"), clockOutUTC: mdtToUtc("2026-04-03", "05:07 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "05:07 PM"), clockOutUTC: mdtToUtc("2026-04-03", "11:00 PM") },
    ]
  },
  {
    name: "Carlos hernandez", newId: 17,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "03:26 PM"), clockOutUTC: mdtToUtc("2026-03-30", "09:44 PM") },
      { clockInUTC: mdtToUtc("2026-03-30", "03:26 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:22 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:09 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:35 PM"), clockOutUTC: mdtToUtc("2026-04-04", "12:24 AM") },
    ]
  },
  {
    name: "David lopez", newId: 11,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "01:25 PM"), clockOutUTC: mdtToUtc("2026-03-30", "07:30 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:29 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:07 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:31 PM"), clockOutUTC: mdtToUtc("2026-04-03", "11:00 PM") },
    ]
  },
  {
    name: "Demetrio", newId: 6,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "04:35 AM"), clockOutUTC: mdtToUtc("2026-03-30", "04:35 AM") },
      { clockInUTC: mdtToUtc("2026-03-30", "01:35 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:10 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:05 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:37 PM"), clockOutUTC: mdtToUtc("2026-03-31", "01:37 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:35 PM"), clockOutUTC: mdtToUtc("2026-04-03", "11:20 PM") },
      { clockInUTC: mdtToUtc("2026-04-04", "01:39 PM"), clockOutUTC: mdtToUtc("2026-04-04", "01:39 PM") },
    ]
  },
  {
    name: "Elias Bonilla", newId: 7,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "02:00 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:21 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:10 PM") },
      { clockInUTC: mdtToUtc("2026-04-02", "01:58 PM"), clockOutUTC: mdtToUtc("2026-04-02", "10:35 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "02:10 PM"), clockOutUTC: mdtToUtc("2026-04-03", "09:03 PM") },
    ]
  },
  {
    name: "Francisco Flores", newId: 19,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "01:32 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:13 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:29 PM"), clockOutUTC: mdtToUtc("2026-03-31", "01:30 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:40 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "02:00 PM"), clockOutUTC: mdtToUtc("2026-03-31", "02:10 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:30 PM"), clockOutUTC: mdtToUtc("2026-04-04", "05:57 AM") },
      { clockInUTC: mdtToUtc("2026-04-04", "01:29 PM"), clockOutUTC: mdtToUtc("2026-04-04", "01:30 PM") },
    ]
  },
  {
    name: "Isidrio ruiz", newId: 16,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "01:31 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:06 PM") },
      { clockInUTC: mdtToUtc("2026-03-30", "02:09 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:21 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-04-01", "02:56 AM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:09 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:30 PM"), clockOutUTC: mdtToUtc("2026-04-03", "11:13 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:35 PM"), clockOutUTC: mdtToUtc("2026-04-03", "01:37 PM") },
    ]
  },
  {
    name: "Javier leyva", newId: 12,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "02:08 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:21 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:10 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "02:51 PM"), clockOutUTC: mdtToUtc("2026-04-04", "12:24 AM") },
    ]
  },
  {
    name: "Jesus bonilla", newId: 14,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "03:26 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:22 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:00 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:12 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:30 PM"), clockOutUTC: mdtToUtc("2026-04-03", "09:10 PM") },
    ]
  },
  {
    name: "Jose marquina", newId: 8,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "03:24 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:22 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:00 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "02:10 PM"), clockOutUTC: mdtToUtc("2026-04-04", "12:24 AM") },
    ]
  },
  {
    name: "Luis Hernandez", newId: 18,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "02:10 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:06 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-04-01", "11:00 AM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:31 PM"), clockOutUTC: mdtToUtc("2026-03-31", "01:31 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "02:44 PM"), clockOutUTC: mdtToUtc("2026-03-31", "03:08 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:31 PM"), clockOutUTC: mdtToUtc("2026-04-04", "12:24 AM") },
    ]
  },
  {
    name: "Merlin diaz", newId: 15,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "01:33 PM"), clockOutUTC: mdtToUtc("2026-03-31", "05:17 AM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:11 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:29 PM"), clockOutUTC: mdtToUtc("2026-04-03", "11:01 PM") },
    ]
  },
  {
    name: "Reed mccluskey", newId: 10,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "02:25 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:03 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:29 PM"), clockOutUTC: mdtToUtc("2026-04-01", "12:07 AM") },
      { clockInUTC: mdtToUtc("2026-04-03", "04:49 PM"), clockOutUTC: mdtToUtc("2026-04-03", "11:46 PM") },
    ]
  },
  {
    name: "Vicente camacho", newId: 13,
    entries: [
      { clockInUTC: mdtToUtc("2026-03-30", "01:58 PM"), clockOutUTC: mdtToUtc("2026-03-30", "02:09 PM") },
      { clockInUTC: mdtToUtc("2026-03-30", "03:27 PM"), clockOutUTC: mdtToUtc("2026-03-30", "11:09 PM") },
      { clockInUTC: mdtToUtc("2026-03-31", "01:30 PM"), clockOutUTC: mdtToUtc("2026-03-31", "11:10 PM") },
      { clockInUTC: mdtToUtc("2026-04-03", "01:32 PM"), clockOutUTC: mdtToUtc("2026-04-03", "11:11 PM") },
    ]
  },
];

async function matchAndFix() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

  const conn = await mysql.createConnection(url);

  // Get all orphaned clock entries grouped by old employeeId
  const [allOrphaned] = await conn.query(`
    SELECT ce.id, ce.employeeId, ce.clockIn, ce.clockOut
    FROM clockEntries ce
    LEFT JOIN employees e ON ce.employeeId = e.id
    WHERE e.id IS NULL
    ORDER BY ce.employeeId, ce.clockIn ASC
  `) as any[];

  const orphanedArr = allOrphaned as any[];
  console.log(`Total orphaned entries: ${orphanedArr.length}`);

  // Group by old employeeId
  const byOldId: Record<number, any[]> = {};
  for (const entry of orphanedArr) {
    if (!byOldId[entry.employeeId]) byOldId[entry.employeeId] = [];
    byOldId[entry.employeeId].push(entry);
  }

  const oldIds = Object.keys(byOldId).map(Number);
  console.log(`Unique old employee IDs: ${oldIds.join(", ")}`);
  console.log(`Old IDs count: ${oldIds.length}, PDF employees: ${employees.length}`);

  // For each PDF employee, score against each old ID group
  // Score = sum of (1 / (1 + min_time_diff_in_minutes)) for each PDF entry matched to closest DB entry
  const mapping: Record<number, { newId: number; name: string; score: number }> = {};
  const usedNewIds = new Set<number>();

  // Score each combination
  const scores: { oldId: number; newId: number; name: string; score: number; matchCount: number }[] = [];

  for (const emp of employees) {
    for (const oldId of oldIds) {
      const dbEntries = byOldId[oldId];
      let totalScore = 0;
      let matchCount = 0;

      for (const pdfEntry of emp.entries) {
        const pdfIn = new Date(pdfEntry.clockInUTC).getTime();
        
        // Find closest DB entry by clockIn time
        let minDiff = Infinity;
        for (const dbEntry of dbEntries) {
          const dbIn = new Date(dbEntry.clockIn).getTime();
          const diff = Math.abs(dbIn - pdfIn) / 60000; // minutes
          if (diff < minDiff) minDiff = diff;
        }
        
        if (minDiff < 10) { // Within 10 minutes = likely match
          totalScore += 1 / (1 + minDiff);
          matchCount++;
        }
      }

      if (matchCount > 0) {
        scores.push({ oldId, newId: emp.newId, name: emp.name, score: totalScore, matchCount });
      }
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Greedy assignment: best score first, no reuse
  const usedOldIds = new Set<number>();

  for (const s of scores) {
    if (usedOldIds.has(s.oldId) || usedNewIds.has(s.newId)) continue;
    mapping[s.oldId] = { newId: s.newId, name: s.name, score: s.score };
    usedOldIds.add(s.oldId);
    usedNewIds.add(s.newId);
    console.log(`MATCH: Old ID ${s.oldId} (${byOldId[s.oldId].length} entries) -> ${s.name} (new ID ${s.newId}) [score: ${s.score.toFixed(2)}, ${s.matchCount}/${employees.find(e => e.newId === s.newId)!.entries.length} entries matched]`);
  }

  // Show unmapped
  const unmappedOld = oldIds.filter(id => !usedOldIds.has(id));
  const unmappedNew = employees.filter(e => !usedNewIds.has(e.newId));
  
  if (unmappedOld.length > 0) {
    console.log(`\nUnmapped old IDs: ${unmappedOld.join(", ")}`);
    for (const id of unmappedOld) {
      console.log(`  Old ID ${id}: ${byOldId[id].length} entries, first clockIn: ${byOldId[id][0].clockIn}`);
    }
  }
  if (unmappedNew.length > 0) {
    console.log(`\nUnmapped new employees: ${unmappedNew.map(e => `${e.name} (ID ${e.newId})`).join(", ")}`);
  }

  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    console.log("\n=== DRY RUN - No changes made ===");
    console.log("Run without --dry-run to apply changes");
  } else {
    console.log("\n=== APPLYING FIXES ===");
    
    for (const [oldId, m] of Object.entries(mapping)) {
      // Update clockEntries
      const [r1] = await conn.query(
        `UPDATE clockEntries SET employeeId = ? WHERE employeeId = ?`,
        [m.newId, Number(oldId)]
      ) as any[];
      console.log(`clockEntries: old ${oldId} -> new ${m.newId} (${m.name}): ${r1.affectedRows} rows`);

      // Update pivotMemory
      const [r2] = await conn.query(
        `UPDATE pivotMemory SET employeeId = ? WHERE employeeId = ?`,
        [m.newId, Number(oldId)]
      ) as any[];
      if (r2.affectedRows > 0) console.log(`  pivotMemory: ${r2.affectedRows} rows`);

      // Update timeAdjustments
      const [r3] = await conn.query(
        `UPDATE timeAdjustments SET adjustedBy = ? WHERE adjustedBy = ?`,
        [m.newId, Number(oldId)]
      ) as any[];
      if (r3.affectedRows > 0) console.log(`  timeAdjustments: ${r3.affectedRows} rows`);
    }

    // Verify
    const [remaining] = await conn.query(`
      SELECT COUNT(*) as count FROM clockEntries ce
      LEFT JOIN employees e ON ce.employeeId = e.id
      WHERE e.id IS NULL
    `) as any[];
    console.log(`\nRemaining orphaned entries: ${(remaining as any[])[0].count}`);
  }

  await conn.end();
}

matchAndFix().catch(console.error);
