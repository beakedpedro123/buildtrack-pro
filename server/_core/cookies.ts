import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");

  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}

/**
 * Extract parent domain for cookie sharing across subdomains.
 * e.g., "3000-xxx.manuspre.computer" -> ".manuspre.computer"
 * This allows cookies set by 3000-xxx to be read by 8081-xxx
 */
function getParentDomain(hostname: string): string | undefined {
  // Don't set domain for localhost or IP addresses
  if (LOCAL_HOSTS.has(hostname) || isIpAddress(hostname)) {
    return undefined;
  }

  // Split hostname into parts
  const parts = hostname.split(".");

  // Need at least 3 parts for a subdomain (e.g., "3000-xxx.manuspre.computer")
  // For "manuspre.computer", we can't set a parent domain
  if (parts.length < 3) {
    return undefined;
  }

  // Return parent domain with leading dot (e.g., ".manuspre.computer")
  // This allows cookie to be shared across all subdomains
  return "." + parts.slice(-2).join(".");
}

export function getSessionCookieOptions(
  req: Request,
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const hostname = req.hostname;
  const domain = getParentDomain(hostname);
  const isProduction = process.env.NODE_ENV === "production";
  const isLocalDev = LOCAL_HOSTS.has(hostname);

  // SECURITY FIX: In production, ALWAYS set secure: true to ensure cookies
  // are NEVER sent over plain HTTP. In development, derive from the request.
  const secure = isProduction ? true : isSecureRequest(req);

  // SECURITY FIX (Medium #10): Use "lax" sameSite for CSRF protection.
  // "none" allows cross-site cookie sending which enables CSRF attacks.
  // "lax" sends cookies on top-level navigations but blocks cross-site POST requests.
  // Exception: In development with cross-origin setup (e.g., Manus sandbox), use "none" + secure
  // because the API and Metro run on different subdomains.
  const isDevCrossOrigin = !!(domain && domain.includes("manus"));
  const sameSite: "lax" | "none" = isDevCrossOrigin ? "none" : "lax";

  return {
    domain,
    httpOnly: true,
    path: "/",
    sameSite,
    secure,
  };
}
