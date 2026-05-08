import { createConnection } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Load env
dotenv.config({ path: '.env' });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Parse the DATABASE_URL
const url = new URL(dbUrl);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false }
});

// Find Brian Ramirez
const [rows] = await conn.execute(
  "SELECT id, name, companyId, role FROM employees WHERE name LIKE '%Ricky%' OR name LIKE '%Ricardo%Ocampo%' OR name LIKE '%ricky%'"
);

if (rows.length === 0) {
  // Try broader search
  const [rows2] = await conn.execute(
    "SELECT id, name, companyId, role FROM employees WHERE name LIKE '%Ricky%' OR name LIKE '%Ricardo%'"
  );
  console.log('Found employees matching Ricky or Ricardo:');
  console.log(rows2);
} else {
  console.log('Found:', rows);
  
  // Hash the new PIN
  const newPin = '0959';
  const hashed = await bcrypt.hash(newPin, 10);
  
  // Update the PIN
  const [result] = await conn.execute(
    'UPDATE employees SET pin = ? WHERE id = ?',
    [hashed, rows[0].id]
  );
  
  console.log(`Updated PIN for ${rows[0].name} (ID: ${rows[0].id})`);
  console.log('Rows affected:', result.affectedRows);
  console.log('New PIN: 1234');
}

await conn.end();
