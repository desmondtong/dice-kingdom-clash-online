import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { createSfx } from "./audio/sfx.ts";
import Home from "./pages/Home.tsx";
import Room from "./pages/Room.tsx";
import "./styles/global.css";

const FixtureGallery = import.meta.env.DEV
  ? lazy(() => import("./pages/FixtureGallery.tsx"))
  : null;
const MUSIC_MUTED_KEY = "dkc.musicMuted";
function loadMusicMuted(): boolean {
  try {
    return localStorage.getItem(MUSIC_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}
export default function App() {
  const [musicMuted, setMusicMuted] = useState(loadMusicMuted);
  const [audio] = useState(() => {
    let current = createSfx();
    current.setMusicMuted(loadMusicMuted());
    return {
      start: () => {
        current = createSfx();
        current.setMusicMuted(loadMusicMuted());
      },
      sfx: {
        unlock: () => current.unlock(),
        play: (name: import("./audio/sfx.ts").SoundName) => current.play(name),
        playEvent: (event: import("../shared/types.ts").GameEvent) => current.playEvent(event),
        dispose: () => current.dispose(),
        setMusicMuted: (muted: boolean) => current.setMusicMuted(muted),
      },
    };
  });
  const sfx = audio.sfx;
  useEffect(() => {
    audio.start();
    return () => sfx.dispose();
  }, [audio, sfx]);
  useEffect(() => {
    sfx.setMusicMuted(musicMuted);
  }, [musicMuted, sfx]);
  useEffect(() => {
    // Tabs in the same browser share the setting, so muting one tab mutes the others.
    const onStorage = (e: StorageEvent) => {
      if (e.key === MUSIC_MUTED_KEY) setMusicMuted(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const toggleMusic = () => {
    const next = !musicMuted;
    setMusicMuted(next);
    try {
      localStorage.setItem(MUSIC_MUTED_KEY, next ? "1" : "0");
    } catch {
      // Private modes may block storage; the toggle still works for this tab.
    }
  };
  return (
    <BrowserRouter>
      <div
        onClickCapture={() => {
          sfx.unlock();
          sfx.play("click");
        }}
      >
        <button
          type="button"
          className="btn btn-light btn-sm music-toggle"
          aria-pressed={musicMuted}
          aria-label={musicMuted ? "Unmute music" : "Mute music"}
          onClick={toggleMusic}
        >
          {musicMuted ? "🔇 Music off" : "🔊 Music on"}
        </button>
        <Suspense fallback={<p>Loading…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/room/:code" element={<Room sfx={sfx} />} />
            {FixtureGallery && <Route path="/dev/fixtures" element={<FixtureGallery />} />}
            <Route
              path="*"
              element={
                <main className="room-shell">
                  <h1>Page not found</h1>
                  <Link to="/">Back to Home</Link>
                </main>
              }
            />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}
