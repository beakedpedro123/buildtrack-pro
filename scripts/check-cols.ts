import "./load-env.js";
import mysql from "mysql2/promise";
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);
  const [cols] = await conn.execute("DESCRIBE companies");
  console.log(JSON.stringify(cols, null, 2));
  await conn.end();
}
main();
