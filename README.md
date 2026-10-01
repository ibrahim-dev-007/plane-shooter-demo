# Plane Shooter

A Next.js wrapper around the Plane Shooter canvas game. The home page (`/`) opens the game full-screen straight away.

## Run it

```bash
npm run dev      # development, http://localhost:3000 (or the next free port)
npm run build    # production build
npm run start    # serve the production build
```

For production, copy `.env.example` to `.env.local` and set `GAME_SECRET` to a long random value. Without it the server invents a temporary secret on every start, which only works for a single server process.

## Where things are

| Path | What it is |
| --- | --- |
| `game/` | The game itself: `index.html` plus its images and sounds. Edit the game here. |
| `lib/game-gate.ts` | Decides who may fetch the game files, and the list of files that may be served. |
| `app/play/launch/route.ts` | Starts a game session (signed cookie) and returns the private game URL. |
| `app/play/[ticket]/[file]/route.ts` | Serves the game page, images and sounds to the game iframe only. |
| `app/game-frame.tsx` | The full-screen iframe on the home page. |

If the game starts using a new image or sound, put the file in `game/` and add it to `GAME_FILES` in `lib/game-gate.ts`. Files that are not on that list are never served.

## How the game files are protected

The game is not in `public/`, so it has no static URL. It is only reachable through `/play/<ticket>/<file>`, and a request is answered only when all of these hold:

- the visitor has a valid session cookie (signed, `HttpOnly`, 12 hours) issued by the home page;
- the `<ticket>` in the URL belongs to that session, so URLs differ per visitor and expire with the session;
- the browser says the request comes from this site and is the right kind: the game page only as the iframe, images only as image loads, sounds only as audio loads;
- the file is on the allow-list.

If the site has a service worker (a PWA, for example), it re-sends every request as its own fetch, so the browser's "what is this for" label is lost. Those requests are accepted only as a navigation coming from the home page (the game page) or an image/audio-style load coming from the game page (its files).

Everything else gets a 404. That covers typing a game URL into the address bar, opening one in a new tab, `view-source:`, `fetch()` from the console, other sites hotlinking the files or embedding the game, and guessing file paths.

### What this cannot do

A browser has to download the game to run it. Someone determined can still copy what their own browser received (for example from the DevTools Network or Sources panel), and a script that first gets a session and then imitates a browser's headers can fetch the files. No web game can prevent that; the gate stops casual and automated direct access, not a visitor inspecting their own browser.
