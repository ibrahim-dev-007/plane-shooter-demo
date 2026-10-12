// The game lives in /game, outside /public, so Next.js never serves it as a static file.
// Everything here decides who may fetch those files through the /play routes.
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { safeEqual, sign } from "./signing";

export const SESSION_COOKIE = "pc_session";
const SESSION_SECONDS = 12 * 60 * 60;
const RENEW_BELOW_SECONDS = 60 * 60;

const GAME_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "game");

type FileKind = "frame" | "image" | "audio";

// The only files that can ever leave the game folder. Anything else is a 404,
// which also rules out path tricks like "../".
const GAME_FILES: Record<string, { type: string; kind: FileKind }> = {
  "index.html": { type: "text/html; charset=utf-8", kind: "frame" },
  "bg-sprite.png": { type: "image/png", kind: "image" },
  "bg-sprite-1.png": { type: "image/png", kind: "image" },
  "bg-sprite-2.png": { type: "image/png", kind: "image" },
  "boss.png": { type: "image/png", kind: "image" },
  "cloud.png": { type: "image/png", kind: "image" },
  "enemy-plane-1.png": { type: "image/png", kind: "image" },
  "enemy-plane-2.png": { type: "image/png", kind: "image" },
  "enemy-plane-3.png": { type: "image/png", kind: "image" },
  "explosion.png": { type: "image/png", kind: "image" },
  "missile.png": { type: "image/png", kind: "image" },
  "my-plane.png": { type: "image/png", kind: "image" },
  "my-plane-1.png": { type: "image/png", kind: "image" },
  "my-plane-2.png": { type: "image/png", kind: "image" },
  "my-plane-3.png": { type: "image/png", kind: "image" },
  "powerup.png": { type: "image/png", kind: "image" },
  "tank-barrel.png": { type: "image/png", kind: "image" },
  "tank-body.png": { type: "image/png", kind: "image" },
  "background.mp3": { type: "audio/mpeg", kind: "audio" },
  "dead.mp3": { type: "audio/mpeg", kind: "audio" },
  "shoot.mp3": { type: "audio/mpeg", kind: "audio" },
  "shoot2.mp3": { type: "audio/mpeg", kind: "audio" },
  "mixkit-fire-explosion-1343.wav": { type: "audio/wav", kind: "audio" },
};

// ---------- Sessions ----------
// Signing lives in lib/signing.ts, shared with the payment routes.
export type Session = { id: string; expires: number };

export function createSession(): Session {
  return {
    id: randomBytes(16).toString("base64url"),
    expires: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
}

export function encodeSession(session: Session): string {
  return `${session.id}.${session.expires}.${sign(`session:${session.id}.${session.expires}`)}`;
}

export function readSession(raw: string | undefined): Session | null {
  if (!raw) return null;
  const [id, expiresText, signature, ...rest] = raw.split(".");
  if (!id || !expiresText || !signature || rest.length > 0) return null;
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 <= Date.now()) return null;
  if (!safeEqual(signature, sign(`session:${id}.${expires}`))) return null;
  return { id, expires };
}

export function shouldRenew(session: Session): boolean {
  return session.expires - Date.now() / 1000 < RENEW_BELOW_SECONDS;
}

// The ticket is the folder name in every game URL: /play/<ticket>/boss.png.
// It is derived from the session, so the URLs differ per visitor and stop
// working when the session ends.
export function ticketFor(session: Session): string {
  return sign(`ticket:${session.id}.${session.expires}`).slice(0, 32);
}

export function ticketMatches(session: Session, ticket: string): boolean {
  return safeEqual(ticket, ticketFor(session));
}

// ---------- Request checks ----------
function sameOriginUrl(request: NextRequest, header: "referer" | "origin"): URL | null {
  const value = request.headers.get(header);
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host")];
  return hosts.includes(url.host) ? url : null;
}

// Browsers attach Sec-Fetch-* headers that page scripts cannot fake. They say
// whether a request comes from our own pages and what it is for.
export function isOwnPageRequest(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  return sameOriginUrl(request, "origin") !== null; // older browsers
}

export function isGameRequest(request: NextRequest, kind: FileKind, ticket: string): boolean {
  // Which of our pages asked: the home page asks for the game page, the game page for its files.
  const referer = sameOriginUrl(request, "referer");
  const fromRightPage =
    referer !== null && referer.pathname === (kind === "frame" ? "/" : `/play/${ticket}/index.html`);

  const site = request.headers.get("sec-fetch-site");
  if (site === null) {
    // Older browsers (and plain-http LAN addresses) send no Sec-Fetch-* headers,
    // so the asking page is all there is to go on.
    return fromRightPage;
  }
  if (site !== "same-origin") return false;

  // The page may only be loaded inside our <iframe>, images only by <img>-style
  // loads, sounds only by an audio element. Typing the URL into the address
  // bar arrives as "document" and is refused.
  const dest = request.headers.get("sec-fetch-dest");
  if (kind === "frame" && dest === "iframe") return true;
  if (kind === "image" && dest === "image") return true;
  if (kind === "audio" && (dest === "audio" || dest === "video")) return true;

  // A service worker on the site (a PWA, for example) re-sends every request as
  // its own fetch, which arrives as "empty". Accept that only when the rest still
  // looks like the game loading itself: a navigation coming from the home page,
  // or an <img>/<audio>-style load coming from the game page. An address-bar
  // visit has no asking page, and a console fetch() has the wrong mode.
  if (dest !== "empty" || !fromRightPage) return false;
  const mode = request.headers.get("sec-fetch-mode");
  return kind === "frame" ? mode === "navigate" : mode === "no-cors";
}

// ---------- Files ----------
type LoadedFile = { data: Buffer; etag: string };
const fileCache = new Map<string, LoadedFile>();

export function findGameFile(name: string) {
  return Object.hasOwn(GAME_FILES, name) ? GAME_FILES[name] : null;
}

export async function loadGameFile(name: string): Promise<LoadedFile> {
  const cached = fileCache.get(name);
  if (cached) return cached;
  const data = await readFile(path.join(GAME_DIR, name));
  const loaded = { data, etag: `"${createHash("sha1").update(data).digest("base64url")}"` };
  // keep the dev server reading from disk so edits to the game show up
  if (process.env.NODE_ENV === "production") fileCache.set(name, loaded);
  return loaded;
}

export function notFound(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

const FRAME_HEADERS = {
  "Cache-Control": "no-store",
  // the game is one self-contained page: inline code, its own images and sounds, and
  // fetch() calls to this site's /api/payment routes for the shop
  "Content-Security-Policy":
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; " +
    "media-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "same-origin",
};

const ASSET_HEADERS = {
  // Cached only in the visitor's browser. Vary keeps the cache from answering an
  // address-bar request with a copy that was stored for the game.
  "Cache-Control": "private, max-age=43200",
  Vary: "Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, Referer",
  "Accept-Ranges": "bytes",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export function gameFileResponse(request: NextRequest, file: LoadedFile, type: string, kind: FileKind): Response {
  const { data, etag } = file;
  const headers = new Headers(kind === "frame" ? FRAME_HEADERS : ASSET_HEADERS);
  headers.set("Content-Type", type);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex");

  if (kind !== "frame") {
    // browsers only keep partial (audio) downloads in their cache when there is an ETag
    headers.set("ETag", etag);
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
  }

  // Audio elements ask for byte ranges, and Safari refuses to play without them.
  const ifRange = request.headers.get("if-range");
  const range = kind === "frame" || (ifRange !== null && ifRange !== etag) ? null : request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = 0;
    let end = data.length - 1;
    let valid = match !== null && (match[1] !== "" || match[2] !== "");
    if (match && valid) {
      if (match[1] === "") {
        start = Math.max(0, data.length - Number(match[2])); // "bytes=-500": the last 500 bytes
      } else {
        start = Number(match[1]);
        if (match[2] !== "") end = Math.min(end, Number(match[2]));
      }
      valid = start <= end && start < data.length;
    }
    if (!valid) {
      headers.set("Content-Range", `bytes */${data.length}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${data.length}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers });
  }

  headers.set("Content-Length", String(data.length));
  return new Response(new Uint8Array(data), { status: 200, headers });
}
