import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  createSession,
  encodeSession,
  isOwnPageRequest,
  readSession,
  shouldRenew,
  ticketFor,
} from "@/lib/game-gate";

// The home page calls this to get a game session: a signed, HttpOnly cookie plus
// the private URL the game iframe should load.
export async function POST(request: NextRequest) {
  if (!isOwnPageRequest(request)) {
    return new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  // Keep a live session, so the URLs stay the same and the browser can reuse its cached files.
  let session = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session || shouldRenew(session)) session = createSession();

  const response = NextResponse.json(
    { src: `/play/${ticketFor(session)}/index.html` },
    { headers: { "Cache-Control": "no-store" } },
  );
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol;
  response.cookies.set({
    name: SESSION_COOKIE,
    value: encodeSession(session),
    httpOnly: true,
    sameSite: "strict",
    secure: protocol.startsWith("https"),
    path: "/play",
    expires: new Date(session.expires * 1000),
  });
  return response;
}
