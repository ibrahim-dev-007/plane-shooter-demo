import { NextResponse, type NextRequest } from "next/server";
import { isOwnPageRequest } from "@/lib/game-gate";
import { confirmPayment } from "@/lib/payments";

// Step 2 of the demo checkout: the pending token comes back with the one-time code,
// and a signed receipt is returned when it matches.
export async function POST(request: NextRequest) {
  if (!isOwnPageRequest(request)) {
    return new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const body = (await request.json().catch(() => null)) as { token?: unknown; otp?: unknown } | null;
  const result = confirmPayment(body?.token, body?.otp);
  return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
