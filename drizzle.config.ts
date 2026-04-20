import { defineConfig } from "drizzle-kit";

// Use PG_DATABASE_URL if set, otherwise fall back to local PostgreSQL
const connectionString = process.env.PG_DATABASE_URL || "postgresql://buildtrack:buildtrack123@localhost:5432/buildtrack";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
