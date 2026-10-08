// A stand-in for a mobile-wallet payment: the player gives a phone number, gets a
// one-time code, and the purchase is confirmed when the code comes back. No money
// moves. Every step is a signed, stateless token, so it works across server
// instances without a database.
//
// To connect a real provider (bKash, Nagad, SSLCommerz, Stripe, ...): startPayment()
// is where the provider's "create payment" call goes, confirmPayment() is where its
// "execute / verify" call goes, and demoOtp disappears because the provider sends the
// real code by SMS. The game only needs the final receipt.
import { randomBytes, randomInt } from "node:crypto";
import { decodeToken, encodeToken, safeEqual, sign } from "./signing";

export const CURRENCY = "BDT";

// Prices are the server's call; the game shows the same numbers but never decides them.
export const CATALOG = {
  hangar: { name: "Full Hangar", price: 99 },
  armor: { name: "Armor Plating", price: 49 },
  revive3: { name: "Revive Pack", price: 99 },
  // premium planes, each with its own perk (see PLANES in game/index.html)
  plane_titan: { name: "Titan", price: 149 },
  plane_striker: { name: "Striker", price: 149 },
  plane_aegis: { name: "Aegis", price: 199 },
  plane_wraith: { name: "Wraith", price: 179 },
} as const;
export type ItemId = keyof typeof CATALOG;

const OTP_SECONDS = 5 * 60;
const MAX_TRIES = 3;

type Pending = {
  txn: string;
  item: ItemId;
  phone: string;
  otp: string; // HMAC of the code, never the code itself
  exp: number; // unix seconds
  tries: number;
};

export type Receipt = {
  txn: string;
  item: ItemId;
  phone: string; // masked, e.g. 017*****45
  paid: number;
  currency: string;
  at: number;
};

export function isItemId(value: unknown): value is ItemId {
  return typeof value === "string" && Object.hasOwn(CATALOG, value);
}

// Digits only, optional leading "+", 10 to 15 digits: fits local and international numbers.
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const phone = raw.replace(/[\s\-().]/g, "");
  return /^\+?\d{10,15}$/.test(phone) ? phone : null;
}

function maskPhone(phone: string): string {
  return phone.length <= 5 ? phone : phone.slice(0, 3) + "*".repeat(phone.length - 5) + phone.slice(-2);
}

function hashOtp(txn: string, otp: string): string {
  return sign(`otp:${txn}:${otp}`);
}

export type StartResult =
  | { ok: true; token: string; txn: string; expiresIn: number; demoOtp: string }
  | { ok: false; error: "unknown_item" | "bad_phone" };

export function startPayment(item: unknown, rawPhone: unknown): StartResult {
  if (!isItemId(item)) return { ok: false, error: "unknown_item" };
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "bad_phone" };

  const txn = "PC-" + randomBytes(4).toString("hex").toUpperCase();
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const pending: Pending = {
    txn,
    item,
    phone,
    otp: hashOtp(txn, otp),
    exp: Math.floor(Date.now() / 1000) + OTP_SECONDS,
    tries: 0,
  };
  // A real wallet would text the code to the phone here. In the demo it is handed
  // back so the game can show it on screen.
  return { ok: true, token: encodeToken(pending, "pending"), txn, expiresIn: OTP_SECONDS, demoOtp: otp };
}

export type ConfirmResult =
  | { ok: true; txn: string; item: ItemId; paid: number; currency: string; receipt: string }
  | { ok: false; error: "wrong_otp"; token: string; triesLeft: number }
  | { ok: false; error: "invalid" | "expired" | "too_many" };

export function confirmPayment(token: unknown, rawOtp: unknown): ConfirmResult {
  const pending = decodeToken<Pending>(token, "pending");
  if (!pending || !isItemId(pending.item)) return { ok: false, error: "invalid" };
  if (pending.exp * 1000 <= Date.now()) return { ok: false, error: "expired" };

  const otp = typeof rawOtp === "string" ? rawOtp.trim() : "";
  if (!/^\d{6}$/.test(otp) || !safeEqual(hashOtp(pending.txn, otp), pending.otp)) {
    const tries = pending.tries + 1;
    if (tries >= MAX_TRIES) return { ok: false, error: "too_many" };
    // Hand back a re-signed token with the attempt counted, so the limit holds
    // without any server-side state.
    return {
      ok: false,
      error: "wrong_otp",
      token: encodeToken({ ...pending, tries }, "pending"),
      triesLeft: MAX_TRIES - tries,
    };
  }

  const entry = CATALOG[pending.item];
  const receipt: Receipt = {
    txn: pending.txn,
    item: pending.item,
    phone: maskPhone(pending.phone),
    paid: entry.price,
    currency: CURRENCY,
    at: Date.now(),
  };
  return {
    ok: true,
    txn: pending.txn,
    item: pending.item,
    paid: entry.price,
    currency: CURRENCY,
    receipt: encodeToken(receipt, "receipt"),
  };
}

// Lets a server-side feature check a receipt the game sends back later.
export function readReceipt(token: unknown): Receipt | null {
  const receipt = decodeToken<Receipt>(token, "receipt");
  return receipt && isItemId(receipt.item) ? receipt : null;
}
