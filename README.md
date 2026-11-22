# apex-drift

An arcade racing game with a **hand-written software 3D renderer on top of the Canvas 2D API**. No WebGL, no frameworks, no build step, no npm dependencies — just HTML, CSS and ES modules.

Meshes, road strips and particles are projected, near-plane clipped, depth-sorted and flat-shaded in JavaScript, then filled as ordinary 2D polygons. The underlying car physics still runs on a flat x/z plane, so driving feels exactly like the original top-down game while the view is fully 3D.

Race against AI on three circuits, drift for score, spend earned credits on new cars and upgrades, switch chase/hood/top cameras, and tune everything live from the admin console.

## Features

- **Software 3D** — perspective chase camera (plus hood and top views), near-plane clipping, painter's-algorithm depth sorting, low-poly car meshes with flat shading, 3D curbs, checkered start line, skid marks and particle sprites. Pure Canvas 2D; no WebGL context is ever created.
- **Driving & drifting** — weighty arcade physics with lateral grip, handbrake slides, self-aligning torque, nitro, off-road penalties and skid marks.
- **Crashing physics** — car-to-car impulses with mass, wall reflection, impact damage, sparks, smoke and camera shake. Damage reduces engine power.
- **Racing** — ordered checkpoints, lap timing, best laps, position standings, AI opponents with per-driver skill, and credit rewards based on position, time and drift score.
- **Cars** — five vehicles with distinct stats: Street, Drift, Race, Rally and Hyper. Drift cars rotate eagerly; race cars grip harder.
- **Upgrades** — engine, tires, brakes, suspension, nitro and armor, each with five levels. Progress saves to `localStorage`.
- **Admin console** — teleport, spawn cars, grant credits, toggle god mode / noclip, set laps, times, upgrades and much more.
- **Clean architecture** — small focused modules; all core logic is DOM-free and covered by Node tests.

## Quick start

Requires Node.js 18+ (only used as a static file server; the game itself runs in the browser).

```bash
npm start          # http://localhost:8080
npm test           # run the logic tests
```

Open <http://localhost:8080> in any modern browser. There is no install step — `package.json` has zero dependencies. You can also serve the folder with any static server (`python3 -m http.server 8080`).

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `Space` | Handbrake (drift) |
| `Shift` | Nitro |
| `R` | Reset car to the racing line |
| `C` | Cycle camera: chase → hood → top |
| `Esc` | Pause / resume |
| `` ` `` or `F1` | Toggle admin console |

## Modes

- **Race** — 1, 3 or 5 laps with 0–7 opponents. Finish higher and drift harder to earn more credits.
- **Free roam** — no checkpoints or clock pressure; just drive, drift and crash.
- **Garage** — preview stats, buy cars, and spend credits on per-car upgrade levels.

## Admin console

Press `` ` `` (or `F1`) and type a command. Every command starts with `/`; `/help` prints the full list in-game.

| Command | Description |
| --- | --- |
| `/help` | List commands |
| `/credits <amount>` | Add or remove credits |
| `/car <id>` | Swap player car (`starter`, `drift`, `racecar`, `rally`, `hyper`) |
| `/cars` | List active cars and ids |
| `/cam <chase\|hood\|top>` | Switch the 3D camera |
| `/spawn <id> [x] [y]` | Spawn an AI car |
| `/kick <carId>` | Remove a car |
| `/tp <x> <y>` / `/tp cp <n>` | Teleport player |
| `/heal` | Restore health and nitro |
| `/god [on\|off]` | Invulnerability |
| `/noclip [on\|off]` | Disable all collisions |
| `/boost <seconds\|off>` | Unlimited nitro |
| `/speed <px/s>` | Set player velocity |
| `/lap <n>` | Set player lap |
| `/resetlap`, `/time <s>` | Control the race clock |
| `/ai <count>` | Set opponent count |
| `/driftscore <points>` | Set drift score |
| `/upgrades <part> <level>` | Set an upgrade level for free |
| `/track <neon\|harbor\|speedway>` | Restart on another track |
| `/flip` | Flip the car around |
| `/fps [on\|off]` | FPS counter |
| `/save`, `/reset`, `/clear` | Save, wipe progress, clear console |

## Project layout

```
index.html            UI markup
styles/main.css       All styling
server.js             Zero-dependency static server
src/main.js           Bootstrap
src/core/             Input, math, events, profile storage, Game orchestrator
src/entities/         Car physics and car catalogue
src/world/            Track spline/collisions and track definitions
src/systems/          Physics, AI, race rules, upgrades, particles, admin commands
src/render/           Software 3D renderer, 3D math, 2D minimap and HUD
src/ui/               Screen routing, garage and console UI
tests/logic.test.js   DOM-free logic tests
tests/render3d.test.js Projection, clipping and camera tests
```

## GitHub

Published at <https://github.com/Aaron-code-eng/eae1234> on the `main` branch. To get the latest version:

```bash
git clone https://github.com/Aaron-code-eng/eae1234.git
cd eae1234
npm start
```

## License

MIT — see [LICENSE](LICENSE).
