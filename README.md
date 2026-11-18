# Slipstream

Slipstream is an original 3D open-wheel arcade racing game for desktop and mobile browsers. It uses Three.js for WebGL rendering and plain JavaScript for game logic. The open-wheel car shapes are original, with no licensed team marks or real driver likenesses.

## Play
Open the published GitHub Pages site, choose a circuit and race settings, then select **Start race** or **Practice session**.

### Controls
- `W` / `↑`: throttle
- `S` / `↓`: brake; reverse at low speed
- `A` / `D` or `←` / `→`: steering
- `Space`: energy boost
- `P` / `Esc`: pause or resume (after finish, return to the garage)
- Mobile: use the on-screen buttons

The game has three circuits, AI rivals, lap timing, practice mode, boost, off-track slowdown, collision response, and local personal bests. Records are saved in the current browser and are not shared online. The driving model is an arcade approximation of open-wheel vehicle dynamics, not a professional simulator or an exact real-world Formula 1 simulation.

## GitHub Pages
This is a static site. Keep `index.html`, `styles.css`, and `game.js` in the repository root and enable GitHub Pages. The 3D renderer loads Three.js from jsDelivr, so players need a network connection and a browser with WebGL support.
