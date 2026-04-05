import "dotenv/config";
import mysql from "mysql2/promise";

// VERIFIED MAPPING based on matching PDF clock-in times with DB timestamps
// PDF times (MDT) match DB display times (EDT) numerically because the app
// stored local device time which was in MDT but the DB interprets as its own timezone.

const ORPHAN_MAPPING: Record<number, { newId: number; name: string }> = {
  100:    { newId: 4,  name: "Pablo Carranza" },
  60001:  { newId: 6,  name: "Demetrio" },
  90001:  { newId: 7,  name: "Elias Bonilla" },
  120001: { newId: 8,  name: "Jose marquina" },
  180001: { newId: 10, name: "Reed mccluskey" },
  180002: { newId: 11, name: "David lopez" },
  180003: { newId: 12, name: "Javier leyva" },
  240001: { newId: 13, name: "Vicente camacho" },
  270001: { newId: 14, name: "Jesus bonilla" },
  270002: { newId: 15, name: "Merlin diaz" },
  270003: { newId: 16, name: "Isidrio ruiz" },
  270004: { newId: 17, name: "Carlos hernandez" },
  270005: { newId: 18, name: "Luis Hernandez" },
  270006: { newId: 19, name: "Francisco Flores" },
  // 270007: test/accidental entries (3 very short entries, seconds long) - will be left orphaned
};

// CRITICAL: Entries currently under Reed (10) actually belong to Ricardo Ocampo (2)
// Entries currently under Jesus (14) actually belong to Juan Melgoza (3)
// These got swapped when Axel changed the IDs.

async function fixDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

  const conn = await mysql.createConnection(url);
  const dryRun = process.argv.includes("--dry-run");

  console.log(dryRun ? "=== DRY RUN ===" : "=== APPLYING FIXES ===");

  // Step 1: Check if there are entries under ID 10 and 14 that need to be reassigned
  const [reedEntries] = await conn.query(
    "SELECT COUNT(*) as count FROM clockEntries WHERE employeeId = 10"
  ) as any[];
  const [jesusEntries] = await conn.query(
    "SELECT COUNT(*) as count FROM clockEntries WHERE employeeId = 14"
  ) as any[];
  
  const reedCount = (reedEntries as any[])[0].count;
  const jesusCount = (jesusEntries as any[])[0].count;
  
  console.log(`\nEntries currently under Reed (10): ${reedCount} (these are actually Ricardo's)`);
  console.log(`Entries currently under Jesus (14): ${jesusCount} (these are actually Juan's)`);

  if (!dryRun) {
    // Step 2: Move current ID 10 entries to temp ID (these belong to Ricardo Ocampo = ID 2)
    if (reedCount > 0) {
      const [r] = await conn.query("UPDATE clockEntries SET employeeId = 99910 WHERE employeeId = 10") as any[];
      console.log(`Moved ${r.affectedRows} entries from Reed(10) -> temp(99910) [Ricardo's entries]`);
    }

    // Step 3: Move current ID 14 entries to temp ID (these belong to Juan Melgoza = ID 3)
    if (jesusCount > 0) {
      const [r] = await conn.query("UPDATE clockEntries SET employeeId = 99914 WHERE employeeId = 14") as any[];
      console.log(`Moved ${r.affectedRows} entries from Jesus(14) -> temp(99914) [Juan's entries]`);
    }

    // Step 4: Apply all orphan mappings
    for (const [oldId, mapping] of Object.entries(ORPHAN_MAPPING)) {
      const [r] = await conn.query(
        "UPDATE clockEntries SET employeeId = ? WHERE employeeId = ?",
        [mapping.newId, Number(oldId)]
      ) as any[];
      console.log(`clockEntries: ${oldId} -> ${mapping.newId} (${mapping.name}): ${r.affectedRows} rows`);
    }

    // Step 5: Move temp entries to correct owners
    if (reedCount > 0) {
      const [r] = await conn.query("UPDATE clockEntries SET employeeId = 2 WHERE employeeId = 99910") as any[];
      console.log(`Moved temp(99910) -> Ricardo Ocampo(2): ${r.affectedRows} rows`);
    }
    if (jesusCount > 0) {
      const [r] = await conn.query("UPDATE clockEntries SET employeeId = 3 WHERE employeeId = 99914") as any[];
      console.log(`Moved temp(99914) -> Juan Melgoza(3): ${r.affectedRows} rows`);
    }

    // Step 6: Fix pivotMemory and timeAdjustments too
    console.log("\nFixing pivotMemory and timeAdjustments...");
    for (const [oldId, mapping] of Object.entries(ORPHAN_MAPPING)) {
      await conn.query("UPDATE pivotMemory SET employeeId = ? WHERE employeeId = ?", [mapping.newId, Number(oldId)]);
      await conn.query("UPDATE timeAdjustments SET adjustedBy = ? WHERE adjustedBy = ?", [mapping.newId, Number(oldId)]);
    }

    // Step 7: Delete the orphaned test entries (270007)
    const [testDel] = await conn.query("DELETE FROM clockEntries WHERE employeeId = 270007") as any[];
    console.log(`Deleted ${testDel.affectedRows} test/accidental entries (old ID 270007)`);

    // Verify
    console.log("\n=== VERIFICATION ===");
    const [remaining] = await conn.query(`
      SELECT COUNT(*) as count FROM clockEntries ce
      LEFT JOIN employees e ON ce.employeeId = e.id
      WHERE e.id IS NULL
    `) as any[];
    console.log(`Remaining orphaned entries: ${(remaining as any[])[0].count}`);

    // Show entry counts per employee
    const [counts] = await conn.query(`
      SELECT e.id, e.name, COUNT(ce.id) as entryCount
      FROM employees e
      LEFT JOIN clockEntries ce ON e.id = ce.employeeId
      GROUP BY e.id, e.name
      ORDER BY e.id
    `) as any[];
    console.log("\nEntry counts per employee:");
    console.table(counts);
  } else {
    console.log("\nWould perform the following:");
    console.log("1. Move current Reed(10) entries -> temp(99910) [Ricardo's]");
    console.log("2. Move current Jesus(14) entries -> temp(99914) [Juan's]");
    for (const [oldId, mapping] of Object.entries(ORPHAN_MAPPING)) {
      console.log(`3. Move orphan ${oldId} -> ${mapping.newId} (${mapping.name})`);
    }
    console.log("4. Move temp(99910) -> Ricardo Ocampo(2)");
    console.log("5. Move temp(99914) -> Juan Melgoza(3)");
    console.log("6. Delete test entries (270007)");
    console.log("\nRun without --dry-run to apply");
  }

  await conn.end();
}

fixDatabase().catch(console.error);
