# Hike Planner 3D: working notes

A hiking planner PWA in plain JavaScript: no build step, no framework, no backend. It is published by GitHub Pages from `main` (root) at https://stefanblaj54-crypto.github.io/hike-planner-3d/ and installed on the owner's phone from that address. The owner is not a developer: he asks for changes in plain language, and pushing to `main` is how a change goes live.

## How a change goes live

- Push to `main`. GitHub Pages republishes in about a minute. `.nojekyll` skips Jekyll, so files are served as they are.
- The installed app checks for changes each time it opens or comes back to the screen (`checkUpdate` in js/app.js asks `check()` in sw.js). The service worker downloads the app's own files again, which is everything it keeps except `lib/`, `fonts/` and `icons/`. If any file changed, it swaps them all in at once and tells the page. The page reloads straight away on the hikes list or About; anywhere else it shows a toast and reloads when the person goes back to the list.
- An ordinary change needs no version bump in sw.js. Do bump `VERSION` in js/app.js for each release: it shows in About and in the menu.
- Bump `VERSION` in sw.js only when a file is added, removed or renamed, or when anything in `lib/`, `fonts/` or `icons/` changes, because those are kept as fixed and only a new service worker refreshes them. Regenerate the offline file list at the same time, from the repository root:

```sh
python3 - <<'EOF'
import os, re, json
fs = ['./', 'index.html', 'app.css'] + sorted(os.path.join(r, f) for d in ['fonts', 'icons', 'img', 'js', 'lib'] for r, _, n in os.walk(d) for f in n if not f.endswith('.txt')) + ['manifest.webmanifest']
s = open('sw.js').read()
s = re.sub(r'const SHELL=\[.*?\];', lambda m: 'const SHELL=' + json.dumps(fs, indent=2) + ';', s, flags=re.S)
open('sw.js', 'w').write(s)
EOF
```

- Keep every path relative (`./`). The site lives under `/hike-planner-3d/`, not at the root of the domain.
- The page only reloads by itself on the hikes list or About, and never twice within 30 seconds, so a host that changes files on every request cannot cause a reload loop.

## Files

- `index.html`: every screen (`home`, `new`, `build`, `view`, `custom`, `about`), the header, menu drawer, sheet, dialog and toast. Scripts are classic scripts loaded in order: theme.js in `<head>`, then core, build, viewer, app.
- `app.css`: all styles. Colours, radii and text size come from CSS variables that js/theme.js sets, so themes and the Customize screen work everywhere. Don't hard-code colours in components.
- `js/theme.js`: themes, accent colours, route palettes, the sky by time of day, and the home-screen skyline drawn from the next hike's real elevation profile. Settings live in localStorage `hp-look`. Exposes `HP.look`.
- `js/core.js`: the `HP` namespace, IndexedDB `hike-planner-3d` (stores `hikes`, `plans`, `blobs`), reading GPX/KML/GeoJSON, GPX export and helpers in `HP.u`. Each hike keeps the blobs `<id>:sat` (satellite JPEG), `<id>:topo` (OpenTopoMap JPEG), `<id>:relief` (used for the list picture when there is no satellite picture) and `<id>:dem` (the heights at the elevation tiles' full detail: Uint16 in 0.2 m steps above `D.dem.min`, `D.dem.w` × `D.dem.h`, rows from north to south).
- `js/build.js`: building a plan. `HP.fetchExtras` gives hikes saved before 1.4 their satellite picture and detailed heights the first time they open with a connection. Covers BRouter routing, terrain heights, the topo texture, places on the way (Overpass), and the day split (dynamic programming that prefers huts and villages for nights). It also holds the weather: forecast, ECMWF ensemble, ERA5 climate records, weather types (`HP.WXT`, `HP.wxClass`) and their percentages.
- `js/viewer.js`: the 3D view (three.js r147), walking times, weather simulations, the readout, the day table and the line colours. How the ground is drawn:
  - The mesh comes from the coarse grid in the plan. The shading detail comes from a texture baked once on the GPU from `<id>:dem` (or from the grid until that is read): red and green hold the slopes for per-pixel light, blue holds how much open sky each point sees (ambient occlusion). It is baked again when the height exaggeration changes.
  - Map styles: `uStyle` 0 = satellite (lightly graded), 1 = topo, 2 = relief, which the shader draws itself from height and slope (treeline and lasting snow from the latitude, contour lines on WebGL 2).
  - One sky colour function (`SKYF`) draws the sky, the haze over distant ground and the soft edges where the model fades into the sky, so they always match. Lambert materials don't get three's `cameraPosition`, hence `uCamP`.
  - The shadow map is fitted to the terrain as the sun sees it, and is redrawn only when the sun moves. The plain map lights the scene from the front left of the first view.
  - Fog sheets, rain and snow fade at the model's edges too. Clouds fade as the camera comes close.
  - The route's dark outline and white casing don't write depth and are drawn in order. All three route lines sit 1.5% of their distance closer to the camera, so slopes beside the path don't cut them.
  - The satellite credit (`#attrib`) must stay visible whenever the satellite style is shown: it is a licence condition of Sentinel-2 cloudless. Steepness is in degrees, measured over about 200 m of path, in five bands. The walking-time slowdown in bad conditions keeps its own thresholds of about 6°, 11° and 17°.
- `js/app.js`: hash routes (`#/`, `#/new`, `#/hike/<id>`, `#/customize`, `#/about`), the home screen, menu, Customize, the planning map (Leaflet), the build flow and update handling.
- `sw.js`: the offline copy and the update check.
- `lib/` holds three.js r147 (with OrbitControls and Line2) and Leaflet 1.9.4. `fonts/` holds Barlow and Barlow Semi Condensed. `icons/` holds the app icons, and `img/contours.svg` is a background.

## Data sources

All are free and need no key: BRouter (`hiking-mountain` profile), Overpass and Nominatim, OpenTopoMap tiles, AWS Terrain Tiles (terrarium), Sentinel-2 cloudless 2025 by EOX (`tiles.maps.eox.at`, zoom ≤ 13, free for personal use with the credit shown), and Open-Meteo for the forecast, the ensemble (`ecmwf_ifs025`) and the archive (ERA5).

## Testing

The tests are Playwright scripts in `tests/`, run in headless Chrome. They use `/usr/bin/google-chrome` if it exists; otherwise set `CHROME` or let Playwright use its own Chromium. Weather and Overpass calls are mocked in `tests/mocks.py`, because the archive API rate-limits and Overpass times out from sandboxes. Run them from the repository root:

```sh
pip install playwright --break-system-packages   # if missing
python3 -m http.server 8777 &                    # serves the repository
python3 tests/redirect_server.py &               # port 8778, a host that redirects index.html
BASE=http://localhost:8777/ python3 tests/test_app.py desktop    # also: mobile, offline
BASE=http://localhost:8778/ python3 tests/test_app.py offline
python3 tests/test_misc.py
python3 tests/test_home.py full                  # also: empty
python3 tests/test_home2.py
python3 tests/test_wx_prob.py
python3 tests/test_update.py                     # serves its own copy on 8791; OLD=<folder or zip> also tests a switch from an older version
BASE=http://localhost:8777/ python3 tests/test_extras.py   # a hike from before 1.4 gets its satellite picture and heights
```

Screenshots go to `tests/shots/`, which git ignores. Look at them after any visual change: the 3D view and the home screen break easily in ways the scripts don't catch.

## Conventions

- Interface text is plain and in sentence case, with no jargon. The person using it is a beginner hiker.
- Units are metric, the minus sign is `−`, and steepness is shown in degrees.
- The 3D view should look premium: real light and shade, haze with distance, no hard edges. Check changes there on phone-sized and desktop screenshots.
- Keep the app working offline for saved hikes, and keep it fast on a phone.
- Commit messages say what changed for the person using the app.
