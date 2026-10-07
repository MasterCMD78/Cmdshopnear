const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCrossOriginMutation({ method, origin, host, secFetchSite }) {
  if (safeMethods.has(String(method).toUpperCase())) return false;
  if (String(secFetchSite ?? "").toLowerCase() === "cross-site") return true;
  if (!origin) return false;

  try {
    const parsedOrigin = new URL(origin);
    return (
      !["http:", "https:"].includes(parsedOrigin.protocol) ||
      !host ||
      parsedOrigin.host.toLowerCase() !== String(host).toLowerCase()
    );
  } catch {
    return true;
  }
}

export function isSafeSignedObjectUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const isGoogleStorageHost =
      url.hostname === "storage.googleapis.com" ||
      url.hostname.endsWith(".storage.googleapis.com");
    return url.protocol === "https:" && isGoogleStorageHost && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function parsePrivateObjectPath(value) {
  if (typeof value !== "string") return null;
  const match = /^uploads\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i.exec(value);
  if (!match || !uuidPattern.test(match[1]) || !uuidPattern.test(match[2])) return null;
  return { ownerId: match[1].toLowerCase(), objectId: match[2].toLowerCase() };
}

export function setApiSecurityHeaders(response, production = false) {
  response.setHeader("Content-Security-Policy", "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  if (production) response.setHeader("Strict-Transport-Security", "max-age=31536000");
}
