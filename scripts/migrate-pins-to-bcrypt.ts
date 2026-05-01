/**
 * One-time migration script: Convert all plaintext PINs to bcrypt hashes
 * 
 * This script:
 * 1. Connects to the production database
 * 2. Reads all employees with plaintext PINs (not starting with "$2b$")
 * 3. Hashes each PIN with bcrypt (cost factor 10)
 * 4. Updates the database with the hashed PIN
 * 
 * Safe to run multiple times — skips already-hashed PINs.
 * 
 * Usage: npx tsx scripts/migrate-pins-to-bcrypt.ts
 */

import "../scripts/load-env.js";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, sql } from "drizzle-orm";

const BCRYPT_ROUNDS = 10;

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL not set. Cannot connect to database.");
    process.exit(1);
  }

  console.log("🔐 PIN Migration: Plaintext → bcrypt");
  console.log("─".repeat(50));

  // Connect to database
  const connection = await mysql.createConnection(dbUrl);
  console.log("✅ Connected to database");

  // Get all employees with their PINs
  const [rows] = await connection.execute("SELECT id, name, pin FROM employees WHERE pin IS NOT NULL AND pin != ''") as any;
  console.log(`📋 Found ${rows.length} employees with PINs`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const { id, name, pin } = row;

    // Skip already-hashed PINs (bcrypt hashes start with $2b$ or $2a$)
    if (pin.startsWith("$2b$") || pin.startsWith("$2a$")) {
      skipped++;
      continue;
    }

    try {
      // Hash the plaintext PIN
      const hashedPin = await bcrypt.hash(pin, BCRYPT_ROUNDS);
      
      // Update in database
      await connection.execute("UPDATE employees SET pin = ? WHERE id = ?", [hashedPin, id]);
      migrated++;
      console.log(`  ✅ Migrated: ${name} (ID: ${id})`);
    } catch (err: any) {
      errors++;
      console.error(`  ❌ Failed: ${name} (ID: ${id}) — ${err.message}`);
    }
  }

  console.log("─".repeat(50));
  console.log(`📊 Results:`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Skipped (already hashed): ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log("─".repeat(50));

  if (errors === 0) {
    console.log("✅ Migration complete! All PINs are now bcrypt-hashed.");
  } else {
    console.log("⚠️  Migration completed with errors. Review the output above.");
  }

  await connection.end();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
