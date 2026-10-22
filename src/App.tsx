import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { createSfx } from "./audio/sfx.ts";
import Home from "./pages/Home.tsx";
import Room from "./pages/Room.tsx";
import "./styles/global.css";

const FixtureGallery = import.meta.env.DEV
  ? lazy(() => import("./pages/FixtureGallery.tsx"))
  : null;
export default function App() {
  const [audio] = useState(() => {
    let current = createSfx();
    return {
      start: () => {
        current = createSfx();
      },
      sfx: {
        unlock: () => current.unlock(),
        play: (name: import("./audio/sfx.ts").SoundName) => current.play(name),
        playEvent: (event: import("../shared/types.ts").GameEvent) => current.playEvent(event),
        dispose: () => current.dispose(),
      },
    };
  });
  const sfx = audio.sfx;
  useEffect(() => {
    audio.start();
    return () => sfx.dispose();
  }, [audio, sfx]);
  return (
    <BrowserRouter>
      <div
        onClickCapture={() => {
          sfx.unlock();
          sfx.play("click");
        }}
      >
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
