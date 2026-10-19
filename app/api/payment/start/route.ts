import { NextResponse, type NextRequest } from "next/server";
import { isOwnPageRequest } from "@/lib/game-gate";
import { startPayment } from "@/lib/payments";

// Step 1 of the demo checkout: the game sends the item, how many (optional, default
// one) and the phone number, and gets back a signed pending-payment token (plus the
// demo one-time code to display).
export async function POST(request: NextRequest) {
  if (!isOwnPageRequest(request)) {
    return new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const body = (await request.json().catch(() => null)) as { item?: unknown; phone?: unknown; qty?: unknown } | null;
  const result = startPayment(body?.item, body?.phone, body?.qty);
  return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
