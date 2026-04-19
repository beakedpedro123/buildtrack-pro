import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [cols] = await conn.execute('DESCRIBE weeklyGoals');
console.log(cols.map(c => c.Field + ' (' + c.Type + ')').join('\n'));

const hasRepeatDaily = cols.some(c => c.Field === 'repeatDaily');
if (!hasRepeatDaily) {
  console.log('\nAdding repeatDaily column...');
  await conn.execute('ALTER TABLE weeklyGoals ADD COLUMN repeatDaily tinyint(1) DEFAULT 0 NOT NULL');
  console.log('Column added!');
} else {
  console.log('\nrepeatDaily column already exists');
}

await conn.end();
