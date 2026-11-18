# Hand Gesture Tetris – MediaPipe

A real-time webcam hand-gesture controlled Tetris web application powered by **Google MediaPipe Tasks Vision (Hand Landmarker)**, **HTML5 Canvas**, and **Web Audio API**.

Pick up Tetromino blocks directly from the side tray with a thumb-and-index pinch, carry them onto the 10×20 neon grid, twist your wrist to rotate 90°, inspect the real-time ghost placement preview, and open your fingers to drop and clear lines.

---

## Features

- **Real-Time MediaPipe Hand Tracking (`VIDEO` mode)**
  - Tracks up to **2 hands** and **21 hand landmarks** via `requestAnimationFrame`
  - Exponential Moving Average (EMA) smoothing + ergonomic workspace padding
  - Gesture State Machine with hysteresis and cooldown debouncing to prevent jitter or accidental double-rotations
  - Live skeleton overlay, pinch meter, wrist angle readout, and "No hand detected" alert
- **2 Game Modes**
  1. **Classic Arcade Mode**: Traditional falling Tetrominoes with rising level speed. Pinch to steer horizontally, twist wrist to rotate 90°, and release pinch to lock into the ghost drop target.
  2. **Challenge Sectors Mode**: Pick any of 3 available blocks from the right tray, drag onto the 10×20 grid, rotate with wrist twists, and clear target line counts within countdown timers across escalating obstacle-seeded sectors.
- **Pre-Game Calibration**
  - Verifies webcam permissions, MediaPipe Hand Landmarker readiness, live hand detection, and interactive Pinch Test gauge
  - Adjustable **Pinch Sensitivity**, **Tracking Smoothness**, and **Camera Mirror** toggles
- **Synthesized Web Audio FX & Particle Visuals**
  - Custom oscillator sound effects for pickup, move, rotate, place, invalid placement, line clear combos, pause, resume, and stage clear
  - Line-clear neon particle bursts, row flashes, and floating combo score popups

---

## Hand Gesture Controls

| Gesture | Action |
| :--- | :--- |
| **Thumb + Index Pinch** | Pick up block from tray (or grip active piece in Classic) |
| **Pinch + Move Hand** | Drag block across the board / steer horizontally |
| **Rotate Wrist Clockwise** | Rotate block +90° |
| **Rotate Wrist Counterclockwise** | Rotate block -90° |
| **Release Pinch** | Place block at ghost preview (rejects red invalid spots) |

---

## Running Locally

### Prerequisites
- Node.js 18+
- Google Chrome or Microsoft Edge (desktop/laptop with webcam)

### Installation & Local Server
```bash
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome or Edge and allow webcam access when prompted.

### Production Build
```bash
npm run build
npm run preview
```

---

## Architecture

- `src/vision/gestureEngine.ts` — Landmark smoothing, palm-normalized pinch ratio with hysteresis, wrist tilt delta, posture classification, and Gesture State Machine.
- `src/vision/useHandTracker.ts` — Webcam `getUserMedia` lifecycle, MediaPipe `HandLandmarker` (`VIDEO` mode) RAF loop, 21-landmark skeleton canvas overlay, and clean resource disposal.
- `src/game/tetrominoes.ts` — 7 Tetromino shapes (`I, O, T, S, Z, J, L`), neon palette, matrix rotations, bounding boxes, and 7-bag randomizer.
- `src/game/tetrisEngine.ts` — Pure 10×20 board collision, line clearing, scoring/combo multipliers, Classic wall-kicks, and Challenge sector definitions.
- `src/components/TetrisCanvas.tsx` — 60fps HTML5 Canvas renderer for locked blocks, cyan/red ghost preview, floating dragged blocks, virtual hand cursor, and particle explosions.
- `src/audio/soundEngine.ts` — Zero-dependency Web Audio API arcade sound synthesizer.
