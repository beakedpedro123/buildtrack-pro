/**
 * Seed script: Insert Pedro's company as company #1
 * Run with: npx tsx scripts/seed-company.ts
 */
import "../scripts/load-env.js";
import mysql from "mysql2/promise";

async function seedCompany() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const connection = await mysql.createConnection(dbUrl);
  
  try {
    // Check if company #1 already exists
    const [existing] = await connection.execute("SELECT id FROM companies WHERE id = 1");
    if ((existing as any[]).length > 0) {
      console.log("Company #1 already exists, skipping seed.");
      await connection.end();
      return;
    }

    // Insert Pedro's company
    const trialEnd = new Date();
    trialEnd.setFullYear(trialEnd.getFullYear() + 10); // Pedro gets lifetime access
    
    await connection.execute(
      `INSERT INTO companies (id, name, slug, ownerEmail, ownerPhone, plan, subscriptionStatus, trialEndDate, maxEmployees, maxJobs, timezone)
       VALUES (1, 'BuildTrack Pro - Pedro', 'buildtrack-pedro', NULL, NULL, 'enterprise', 'active', ?, 999, 999, 'America/Denver')`,
      [trialEnd]
    );
    
    console.log("✅ Company #1 (Pedro's company) inserted successfully!");
    console.log("   Plan: enterprise (lifetime)");
    console.log("   Max employees: 999");
    console.log("   Max jobs: 999");
    
  } catch (err) {
    console.error("Error seeding company:", err);
  } finally {
    await connection.end();
  }
}

seedCompany();
