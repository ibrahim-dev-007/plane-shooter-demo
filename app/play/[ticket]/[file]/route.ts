import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  findGameFile,
  gameFileResponse,
  isGameRequest,
  loadGameFile,
  notFound,
  readSession,
  ticketMatches,
} from "@/lib/game-gate";

// Serves the game page and its images/sounds, but only to the game iframe of a
// visitor with a valid session. Every refusal is a plain 404.
export async function GET(request: NextRequest, context: RouteContext<"/play/[ticket]/[file]">) {
  const { ticket, file } = await context.params;

  const entry = findGameFile(file);
  if (!entry) return notFound();

  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session || !ticketMatches(session, ticket)) return notFound();

  if (!isGameRequest(request, entry.kind, ticket)) return notFound();

  try {
    const loaded = await loadGameFile(file);
    return gameFileResponse(request, loaded, entry.type, entry.kind);
  } catch (error) {
    console.error(`Game file could not be read: ${file}`, error);
    return notFound();
  }
}
