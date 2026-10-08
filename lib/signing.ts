// The one HMAC secret every server instance shares. Game sessions, payment
// steps and receipts are all signed with it.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const globalStore = globalThis as typeof globalThis & { __gameSecret?: Buffer };

// Every server instance must sign with the same secret, or a token issued by
// one instance is refused by the next (on Vercel that showed up as random 404s).
function secret(): Buffer {
  if (!globalStore.__gameSecret) {
    const fromEnv = process.env.GAME_SECRET;
    // Written into the server code by next.config.ts at build time, so all
    // instances of one deployment share it without any setup.
    const fromBuild = process.env.GAME_BUILD_SECRET;
    if (fromEnv && fromEnv.length >= 32) {
      globalStore.__gameSecret = Buffer.from(fromEnv);
    } else if (fromBuild) {
      globalStore.__gameSecret = Buffer.from(fromBuild);
    } else {
      console.warn("No game secret available; using a temporary one that only this process knows.");
      globalStore.__gameSecret = randomBytes(32);
    }
  }
  return globalStore.__gameSecret;
}

export function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// token = base64url(JSON payload) + "." + signature. The scope keeps a token
// issued for one purpose (say, a pending payment) from being replayed as another.
export function encodeToken(payload: object, scope: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(`${scope}:${body}`)}`;
}

export function decodeToken<T>(token: unknown, scope: string): T | null {
  if (typeof token !== "string") return null;
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;
  if (!safeEqual(signature, sign(`${scope}:${body}`))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  } catch {
    return null;
  }
}
