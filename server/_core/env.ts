// SECURITY FIX (Critical #4): No hardcoded fallback for JWT_SECRET.
// In production, the server MUST fail to start if JWT_SECRET is not set.
const jwtSecret = process.env.JWT_SECRET ?? "";
if (!jwtSecret && process.env.NODE_ENV === "production") {
  console.error("[FATAL] JWT_SECRET environment variable is not set. Server cannot start securely.");
  process.exit(1);
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: jwtSecret,
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
