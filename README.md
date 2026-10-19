# Plane Shooter

A Next.js wrapper around the Plane Shooter canvas game. The home page (`/`) opens the game full-screen straight away.

## Run it

```bash
npm run dev      # development, http://localhost:3000 (or the next free port)
npm run build    # production build
npm run start    # serve the production build
```

No configuration is needed, including on Vercel: every build gets its own signing secret, shared by all server instances of that deployment. The only side effect is that a new deployment ends the game sessions of people who have the page open; they get a new one on reload. To keep sessions across deployments, set a `GAME_SECRET` environment variable (32+ random characters, see `.env.example`).

## Where things are

| Path | What it is |
| --- | --- |
| `game/` | The game itself: `index.html` plus its images and sounds. Edit the game here. |
| `lib/game-gate.ts` | Decides who may fetch the game files, and the list of files that may be served. |
| `lib/signing.ts` | The shared HMAC secret and token helpers used by sessions and payments. |
| `lib/payments.ts` | The shop catalog (prices) and the demo phone + OTP payment flow. |
| `app/play/launch/route.ts` | Starts a game session (signed cookie) and returns the private game URL. |
| `app/play/[ticket]/[file]/route.ts` | Serves the game page, images and sounds to the game iframe only. |
| `app/api/payment/start/route.ts` | Checkout step 1: item + phone number in, pending-payment token (and demo OTP) out. |
| `app/api/payment/confirm/route.ts` | Checkout step 2: token + OTP in, signed receipt out. |
| `app/game-frame.tsx` | The full-screen iframe on the home page. |

If the game starts using a new image or sound, put the file in `game/` and add it to `GAME_FILES` in `lib/game-gate.ts`. Files that are not on that list are never served.

## Shop and payments (demo)

The start screen has a **Shop** with four paid upgrades. The upgrades work for real; the payment does not move money.

| Item | Price | What it does |
| --- | --- | --- |
| Full Hangar | ৳99 | Unlocks all four standard planes at once (also offered on the plane picker while planes are locked). |
| Armor Plating | ৳49 | Three runs that start with 7 health instead of 5. One is used up each time a run starts (a revive does not use another). |
| Revive Pack | ৳99 | Three revives. The game-over screen gets a **Continue** button that resumes the run with full health, keeping score, level, time and the current boss. With no revives left, Continue opens the checkout for a pack and resumes once it is paid. |
| Shield | ৳9 each | Shields are held up to ten at a time. The checkout's number-entry step has a stepper so several can go in one payment (it stops at the cap). During a run a shield button sits at the bottom right of the HUD (also the E or Space key); using it wraps the plane in a bubble that takes no damage at all for 5 seconds. Only one shield runs at a time, and any number can be used in a run. |

Four **PRO planes** are sold one by one, from the shop or straight from the plane picker. Each is a recoloured standard sprite with its own perk, defined in `PLANES` in `game/index.html`:

| Plane | Price | Perk |
| --- | --- | --- |
| Titan | ৳149 | +25% max health (stacks with Armor Plating). |
| Striker | ৳149 | +15% rate of fire. |
| Aegis | ৳199 | Takes 15% less damage from every hit. |
| Wraith | ৳179 | Pulls nearby pick-ups to the plane and scores +5% on everything. |

The start screen also shows a **pilot profile**: a name and avatar the player picks, a rank earned by bosses destroyed over all games (Cadet → Pilot → Veteran → Ace → Commander → Legend), and lifetime stats. It lives in the browser under the `localStorage` key `planeCrashProfile`.

Checkout is a popup inside the game: enter a mobile number, "receive" a 6-digit OTP (the demo shows it on screen in a fake SMS bubble), enter it, done. Wrong codes are allowed three times, codes expire after 5 minutes, and the whole flow is stateless: each step is a signed token, so it works on serverless hosts without a database. Purchases are stored in the browser (`localStorage` key `planeCrashWallet`) together with the signed receipts: `hangar` is a flag, `armor`, `revives` and `shields` are counters (`shields` is capped at 10).

To plug in a real provider (bKash, Nagad, SSLCommerz, Stripe, ...), replace `startPayment()` and `confirmPayment()` in `lib/payments.ts` with the provider's create and execute/verify calls and stop returning `demoOtp`. Prices live in `CATALOG` there and in `SHOP` inside `game/index.html`; keep the two in step. A payment may cover several of one item (`qty`, allowed up to the catalog entry's `maxQty`, which only shields set); the receipt records the quantity and the full amount. The currency sign is the `CURRENCY` constant in the game.

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
