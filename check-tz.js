const mysql = require('mysql2/promise');
async function check() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query(
    'SELECT ta.*, e.name as adjBy FROM timeAdjustments ta JOIN employees e ON ta.adjustedBy = e.id ORDER BY ta.createdAt DESC LIMIT 15'
  );
  for (const r of rows) {
    console.log('Entry:', r.entryId, '| By:', r.adjBy, '| Field:', r.field);
    console.log('  Old:', r.oldValue);
    console.log('  New:', r.newValue);
    if (r.newValue && r.newValue.includes('T')) {
      const d = new Date(r.newValue);
      if (d.getTime()) {
        console.log('  New as MDT:', d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Denver' }));
        console.log('  New as UTC:', d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' }));
      }
    }
    console.log('---');
  }

  // Also check what the app shows vs what the DB has for the adjusted entries
  console.log('\n=== Ricardo Apr 4 entry (adjusted to 7:30 AM) ===');
  const [ent] = await conn.query(
    "SELECT ce.*, e.name FROM clockEntries ce JOIN employees e ON ce.employeeId = e.id WHERE e.name LIKE '%Ricardo%' AND ce.clockIn >= '2026-04-04' ORDER BY ce.clockIn LIMIT 3"
  );
  for (const r of ent) {
    const ci = new Date(r.clockIn);
    const co = r.clockOut ? new Date(r.clockOut) : null;
    console.log('  DB clockIn UTC:', ci.toISOString());
    console.log('  As MDT:', ci.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Denver' }));
    if (co) {
      console.log('  DB clockOut UTC:', co.toISOString());
      console.log('  Out MDT:', co.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Denver' }));
    }
    // The app shows 7:30 AM - 6:00 PM for this entry
    // If the user adjusted it to 7:30 AM MDT, the UTC should be 13:30
    // But DB shows 17:30 UTC = 11:30 AM MDT
    // This means the adjustment set hours using setHours(7, 30) on a UTC date
    // setHours uses LOCAL time of the device (MDT), so 7:30 MDT = 13:30 UTC... 
    // BUT the server sandbox is in UTC, so if the adjustment happened on the server...
    // No, adjustments happen on the CLIENT (phone), so setHours uses MDT
    console.log('');
  }

  await conn.end();
}
check().catch(console.error);
