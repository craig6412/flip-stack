# Flip Stack 🥞

Hyper-casual pancake-flipping game. Flip pancakes out of the pan, spin them in the air, and land them flat on the growing stack. One miss and it's over.

**Stack:** TypeScript + Phaser 3 (Matter.js physics) + Vite. Web-first, structured to wrap with Capacitor for Android/iOS. No external art assets — all textures are generated in code (`BootScene`).

## Play it

```bash
npm install
npm run dev        # http://localhost:5173 — open on desktop or phone (same LAN)
npm run build      # production build → dist/
npm run preview    # preview the production build
```

> **Motion controls need HTTPS** (except on `localhost`). For phone testing use the deployed Vercel URL, a tunnel (e.g. `npx ngrok http 5173`), or `vite --host` on a trusted local network where the browser allows it. Swipe always works as a fallback.

## How to play

| Input | Gesture | Result |
|---|---|---|
| 📱 Phone flick | Flick the phone upward (DeviceMotion spike) | Peak acceleration = power, rotation rate = spin |
| 👆 Swipe | Fast upward swipe | Speed = power + spin |
| 🖱️ Circular (desktop) | Drag in circles, release | Loops + angular speed = power + spin |
| 🖱️ Drag | Drag up and release | Simple fallback |
| ⌨️ Space | Press space | Medium test flip (desktop) |
| 🤳 Tilt (in flight) | Tilt phone left/right | Steer the flying pancake (gravity X via DeviceMotion) |
| 👆 Hold + drag (in flight) | Touch and hold, position left/right of centre | Steer the flying pancake |
| ⌨️ ←/→ or A/D (in flight) | Hold arrow keys | Steer the flying pancake (desktop) |

Steering is sim-calibrated: a gentle tilt (≈0.3) corrects the landing by ~±78px, full tilt ~±165px on a medium flip. A tilt meter appears at the top of the screen during flight. Steering comes through the same `InputController.getTilt()` interface, so a Capacitor Motion implementation can supply it natively later.

**Scoring (deterministic):** points come from centeredness + flatness, plus a bonus per extra full flip. A **Perfect** landing (within 13px of centre, within 7° of flat, face-up after ≥1 full flip) pays bonus points, starts/chains a combo multiplier (up to ×3), straightens the pancake, and settles the top of the stack toward centre. Landing face-down, with no full flip, or too far off centre ends the game — far-off landings topple the stack.

**Difficulty (fair, never random-feeling):** everything ramps only with stack height, on a fixed schedule. Pancake size/thickness per height comes from a seeded RNG (the pancake at height N is always identical). Sway starts at height 4. Light wind starts at height 7 and blows one direction for 3 pancakes, then flips — the HUD shows the wind arrow so you can compensate.

**Determinism:** fixed-step Matter physics (120 Hz config in `src/main.ts`), a pure scoring function (`ScoreSystem`), seeded sizes, and one normalised `FlipInput` for every control method — the same input at the same height always gives the same result.

## Project structure

```
src/
  main.ts                  Phaser game config (Matter, fixed timestep, FIT scaling)
  config.ts                ALL tuning constants + settings/best-score persistence
  input/
    InputController.ts     IInputController interface + unified motion/swipe/circular impl
  entities/
    Pancake.ts             Pancake entity: launch, rotation tracking, settle, squash juice
  systems/
    ScoreSystem.ts         Pure deterministic scoring + combo
    DifficultyManager.ts   Seeded sizes, sway & wind schedule by height
  scenes/
    BootScene.ts           Procedural textures (pancake, pan, plate, spark)
    TitleScene.ts          Title, best score, iOS "Tap to enable motion" button
    SettingsScene.ts       Sensitivity slider, control-mode toggle, sound toggle
    GameScene.ts           Core loop, camera pan, HUD, juice (shake/particles/floating text)
    GameOverScene.ts       Score, height, best combo, best score (localStorage)
  utils/
    sound.ts               WebAudio placeholder sounds (sizzle / plop / thud / click)
    ui.ts                  Buttons & text helpers
```

Settings and best score persist in `localStorage` (`flipstack.settings`, `flipstack.bestScore`).

## Roadmap (planned, not in v1)

- **Hosting:** deploy `dist/` to Craig's Vercel account.
- **Accounts & leaderboards:** Supabase Auth (registration/login) + a `scores` table so players can save high scores; a public high-score / leaderboard section. v1 uses localStorage only.
- **Ads:** Google AdSense on the website (and later Google Ads to drive traffic) once the game is live and getting plays.

## Wrap with Capacitor (Android / iOS)

The game is a static web build, so wrapping is straightforward:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init FlipStack com.craig.flipstack --web-dir=dist
npm run build
npx cap add android   # and/or: npx cap add ios  (iOS needs macOS + Xcode)
npx cap sync
npx cap open android  # build/run in Android Studio
```

Notes for the native wrap:

- **Motion input:** `InputController` is behind the `IInputController` interface for exactly this swap. In the Capacitor build, implement the same interface with `@capacitor/motion` (or the Motion plugin of your choice) and pass that implementation in `GameScene.create()` — no gameplay code changes.
- **iOS motion permission:** the Title screen already ships a "Tap to enable motion" button that calls `DeviceMotionEvent.requestPermission()` from a user gesture, which is also what the WKWebView build needs.
- **Safe areas / scaling:** the game uses Phaser `Scale.FIT` + `viewport-fit=cover`, so it letterboxes cleanly on notched phones.
- **Sounds:** `src/utils/sound.ts` uses WebAudio only — it works unchanged inside Capacitor's WebView. Replace the synth placeholders with real samples there when ready.
