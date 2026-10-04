"use client";

import { useEffect, useRef, useState } from "react";

// One launch per page load, even when React re-runs the effect in development.
let launch: Promise<string> | null = null;

function requestLaunch(): Promise<string> {
  if (!launch) {
    launch = fetch("/play/launch", { method: "POST", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Launch failed with status ${response.status}`);
        return response.json() as Promise<{ src: string }>;
      })
      .then((data) => data.src)
      .catch((error) => {
        launch = null;
        throw error;
      });
  }
  return launch;
}

export default function GameFrame() {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  // The game's Exit button asks the host page to leave. Pass it up if this page
  // is itself embedded, otherwise go back to wherever the player came from.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (!event.data || event.data.type !== "planeCrashExit") return;
      if (window.parent !== window) {
        window.parent.postMessage(event.data, "*");
      } else if (window.history.length > 1) {
        window.history.back();
      } else {
        window.close();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestLaunch().then(
      (url) => {
        if (!cancelled) setSrc(url);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (src) {
    return (
      <iframe
        ref={frame}
        src={src}
        title="Plane Shooter"
        allow="autoplay; fullscreen"
        className="fixed inset-0 h-full w-full border-0"
        // give the game the keyboard straight away
        onLoad={() => frame.current?.focus()}
      />
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 text-white">
      {failed ? (
        <>
          <p>The game could not be loaded.</p>
          <button
            className="rounded-lg bg-green-600 px-6 py-2 text-lg"
            onClick={() => {
              setFailed(false);
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </div>
  );
}
