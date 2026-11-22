"""End-to-end checks of the phone app in headless Chrome. Usage: BASE=http://localhost:8777/ python3 tests/test_app.py desktop|mobile|offline"""
import asyncio, sys, time, datetime, json, urllib.parse
from playwright.async_api import async_playwright
import mocks

import os
BASE = os.environ.get("BASE", "http://localhost:8777/")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
DYN = {"pois": list(mocks.BAER)}
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots") + "/"; os.makedirs(SHOTS, exist_ok=True)
GPX = os.path.join(HERE, "baerentrek.gpx"); PHOTO = os.path.join(HERE, "test_photo.jpg")
ESRI_JPG = open(os.path.join(HERE, "esri_mock.jpg"), "rb").read()
CHROME = os.environ.get("CHROME") or ("/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None)  # None: Playwright's own Chromium
HDR = {"access-control-allow-origin": "*"}

async def mock(ctx, log):
    async def arch(r):
        log.append("archive"); await r.fulfill(status=200, content_type="application/json", body=mocks.archive(r.request.url), headers=HDR)
    async def fc(r):
        log.append("forecast " + r.request.url.split("start_date=")[1][:40]); await r.fulfill(status=200, content_type="application/json", body=mocks.forecast(r.request.url), headers=HDR)
    async def ovp(r):
        q = urllib.parse.unquote_plus(r.request.post_data or "")
        if '["highway"]' in q:   # the trail check: real OpenStreetMap paths around the Bärentrek, nothing elsewhere
            log.append("trail"); await r.fulfill(status=200, content_type="application/json", body=mocks.trail(q), headers=HDR); return
        log.append("overpass"); await r.fulfill(status=200, content_type="application/json", body=mocks.overpass(DYN["pois"]), headers=HDR)
    await ctx.route("https://archive-api.open-meteo.com/**", arch)
    await ctx.route("https://api.open-meteo.com/**", fc)
    async def ens(r):
        log.append("ensemble"); await r.fulfill(status=200, content_type="application/json", body=mocks.ensemble(r.request.url), headers=HDR)
    await ctx.route("https://ensemble-api.open-meteo.com/**", ens)
    await ctx.route("https://overpass-api.de/**", ovp)
    await ctx.route("https://overpass.kumi.systems/**", ovp)
    # ArcGIS World Imagery: a made-up picture, so tests don't use the key's free allowance (ESRI=live lets them through)
    async def esri(r):
        if os.environ.get("ESRI") == "live": await r.continue_(); return
        if "f=json" in r.request.url: await r.fulfill(status=200, content_type="application/json", body='{"copyrightText":"Source: Esri, Vantor, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community"}', headers=HDR)
        else: await r.fulfill(status=200, content_type="image/jpeg", body=ESRI_JPG, headers=HDR)
    await ctx.route("https://ibasemaps-api.arcgis.com/**", esri)
    # Swiss trail closures (none, unless a test sets DYN["closures"]) and the country for the emergency numbers
    async def closures(r):
        await r.fulfill(status=200, content_type="application/json", body=json.dumps({"results": DYN.get("closures", [])}), headers=HDR)
    await ctx.route("https://api3.geo.admin.ch/**", closures)
    async def nomi(r):
        if "zoom=3" not in r.request.url: await r.continue_(); return
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(r.request.url).query); lat, lon = float(qs["lat"][0]), float(qs["lon"][0])
        cc = "ch" if 45.8 < lat < 47.8 and 5.9 < lon < 10.5 else "ro" if 43.6 < lat < 48.3 and 20.2 < lon < 29.7 else "it"
        await r.fulfill(status=200, content_type="application/json", body=json.dumps({"address": {"country_code": cc}}), headers=HDR)
    await ctx.route("https://nominatim.openstreetmap.org/reverse**", nomi)

def watch(pg, errs):
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.on("console", lambda m: errs.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)

async def build_and_wait(pg, timeout=240):
    t0 = time.time(); last = ""
    await pg.click("#buildbtn")
    while time.time() - t0 < timeout:
        await pg.wait_for_timeout(1500)
        if await pg.is_visible("#scr-view"):
            break
        st = await pg.evaluate("[...document.querySelectorAll('#steps li')].map(l=>l.dataset.k+':'+l.className+':'+l.querySelector('small').textContent).join(' | ')")
        err = await pg.evaluate("document.querySelector('#berr').hidden?'':document.querySelector('#berr').textContent")
        if st != last: print(f"  {time.time()-t0:5.1f}s {st}"); last = st
        if err: print("  BUILD ERROR:", err); return False
    print(f"  built in {time.time()-t0:.1f}s")
    await pg.wait_for_function("document.querySelector('#msg').hidden", timeout=60000)
    return True

async def desktop(p):
    b = await p.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = await b.new_context(viewport={"width": 1280, "height": 900}, ignore_https_errors=True)
    log, errs = [], []; await mock(ctx, log)
    pg = await ctx.new_page(); watch(pg, errs)
    await pg.goto(BASE + "?nosw#/", wait_until="load"); await pg.wait_for_timeout(1200)
    await pg.screenshot(path=SHOTS + "d_home_empty.png", full_page=True)
    await pg.click("#hero [data-act=draw], #hero [data-act=new]"); await pg.wait_for_timeout(2500)
    await pg.screenshot(path=SHOTS + "d_new_draw.png")
    await pg.click("#tab-file"); await pg.set_input_files("#file", GPX); await pg.wait_for_timeout(1500)
    print("FILE STATS:", await pg.inner_text("#rstats"), "| name:", await pg.input_value("#hname"))
    d = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
    await pg.fill("#hdate", d); await pg.dispatch_event("#hdate", "input")
    await pg.screenshot(path=SHOTS + "d_new_file.png", full_page=True)
    ok = await build_and_wait(pg)
    if not ok:
        await pg.screenshot(path=SHOTS + "d_build_err.png", full_page=True); print("\n".join(errs[:20])); return
    await pg.wait_for_timeout(3000)
    await pg.screenshot(path=SHOTS + "d_view_fc.png")
    print("TITLE:", await pg.inner_text("#ttl"), "| FIGS:", (await pg.inner_text("#figs")).replace("\n", " "))
    print("CHIPS:", (await pg.inner_text("#wchips")).replace("\n", " | "))
    print("TABLE:", (await pg.inner_text("#tbl tbody")).replace("\n", " | ").replace("\t", " "))
    print("BRIEF:", (await pg.inner_text("#brief"))[:2600].replace("\n", " | "))
    await pg.locator("#prof").scroll_into_view_if_needed(); box = await pg.locator("#prof").bounding_box()
    await pg.mouse.move(box["x"] + 50 + (box["width"] - 64) * .22, box["y"] + box["height"] * .4); await pg.wait_for_timeout(400)
    print("READOUT fc 22%:", (await pg.inner_text("#readout")).replace("\n", " | "))
    await pg.screenshot(path=SHOTS + "d_prof_fc.png", clip={"x": 0, "y": box["y"] - 90, "width": 1280, "height": box["height"] + 140})
    await pg.mouse.move(box["x"] + 50 + (box["width"] - 64) * .5, box["y"] + box["height"] * .4); await pg.wait_for_timeout(400)
    print("READOUT fc 50%:", (await pg.inner_text("#readout")).replace("\n", " | "))
    await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(2500)
    await pg.screenshot(path=SHOTS + "d_view_fc_day2.png")
    for wx in ["fair", "storm", "front", "cloud", "sea", "wind", "snow", "plain"]:
        await pg.click(f"[data-wx='{wx}']"); await pg.wait_for_timeout(300)
        if wx in ("storm", "sea", "snow", "front"):
            await pg.locator("#prof").scroll_into_view_if_needed(); box = await pg.locator("#prof").bounding_box()
            await pg.mouse.move(box["x"] + 50 + (box["width"] - 64) * .3, box["y"] + box["height"] * .4); await pg.wait_for_timeout(300)
            await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(2600)
            await pg.screenshot(path=SHOTS + f"d_view_{wx}.png")
        print(f"WX {wx}: days slowed by the weather:", await pg.locator("#tbl tbody td.n small").count(), "| brief:", (await pg.inner_text("#brief"))[:300].replace("\n", " | "))
    # change days, move a night, change date, export
    await pg.select_option("#ndays", "2"); await pg.wait_for_timeout(600)
    print("2 DAYS:", (await pg.inner_text("#tbl tbody")).replace("\n", " | ").replace("\t", " "))
    await pg.select_option("#ndays", "3"); await pg.wait_for_timeout(600)
    print("3 DAYS:", (await pg.inner_text("#tbl tbody")).replace("\n", " | ").replace("\t", " "))
    await pg.click("[data-day='2']"); await pg.wait_for_timeout(1500)
    await pg.screenshot(path=SHOTS + "d_view_day2.png")
    await pg.click("#more"); await pg.wait_for_timeout(300)
    async with pg.expect_download() as dl:
        await pg.click("[data-act='gpx']")
    dfile = await (await dl.value).path(); txt = open(dfile).read()
    print("GPX export:", len(txt), "bytes,", txt.count("<trkpt"), "points,", txt.count("<wpt"), "waypoints")
    await pg.click("#back"); await pg.wait_for_timeout(1500)
    await pg.screenshot(path=SHOTS + "d_home_list.png", full_page=True)
    print("HOME:", (await pg.inner_text("#hikes")).replace("\n", " | "))
    # reopen from the list (from storage)
    await pg.click(".hike"); await pg.wait_for_function("document.querySelector('#msg').hidden", timeout=60000); await pg.wait_for_timeout(1500)
    print("REOPEN days:", await pg.input_value("#ndays"), "wx pressed:", await pg.evaluate("document.querySelector('.wchip[aria-pressed=true]').dataset.wx"))
    print("REQUESTS:", log)
    print("ERRORS:", "\n".join(errs[:30]) or "none")
    await b.close()

async def mobile(p):
    b = await p.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, ignore_https_errors=True,
                              user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36")
    log, errs = [], []; await mock(ctx, log)
    pg = await ctx.new_page(); watch(pg, errs)
    await pg.goto(BASE + "?nosw#/", wait_until="load"); await pg.wait_for_timeout(1000)
    await pg.screenshot(path=SHOTS + "m_home.png")
    await pg.tap("#hero [data-act=draw], #hero [data-act=new]"); await pg.wait_for_timeout(1500)
    await pg.fill("#q", "Bâlea Lac"); await pg.press("#q", "Enter"); await pg.wait_for_timeout(3500)
    print("SEARCH:", (await pg.inner_text("#results")).replace("\n", " | ")[:300])
    await pg.tap("#results button"); await pg.wait_for_timeout(2500)
    await pg.evaluate("HP.dbg.map().fitBounds([[45.5947,24.6168],[45.6036,24.7364]],{padding:[60,60]})"); await pg.wait_for_timeout(2500)
    pts = [(45.6036, 24.6168), (45.5947, 24.6476), (45.6006, 24.7364)]
    for la, lo in pts:
        xy = await pg.evaluate(f"(()=>{{const p=HP.dbg.map().latLngToContainerPoint([{la},{lo}]);const r=document.querySelector('#pmap').getBoundingClientRect();return [p.x+r.left,p.y+r.top]}})()")
        await pg.touchscreen.tap(xy[0], xy[1]); await pg.wait_for_timeout(700)
    print("points:", await pg.evaluate("HP.dbg.NEW.pts.length")); await pg.wait_for_function("HP.dbg.NEW.routed||HP.dbg.NEW.err", timeout=60000); await pg.wait_for_timeout(1500)
    print("ROUTE STATS:", await pg.inner_text("#rstats"))
    await pg.screenshot(path=SHOTS + "m_new_route.png")
    # places near this route for the Overpass stand-in
    R = await pg.evaluate("HP.dbg.NEW.routed.pts.map(p=>[p.lat,p.lon,p.e])")
    hi = max(range(len(R)), key=lambda i: R[i][2]); n = len(R)
    DYN["pois"] = [mocks.node(101, R[0][0], R[0][1] + .0008, tourism="alpine_hut", name="Cabana Bâlea Lac"),
                   mocks.node(102, R[0][0] - .0006, R[0][1], natural="water", name="Lacul Bâlea"),
                   mocks.node(103, R[hi][0], R[hi][1], natural="peak", name="Vârful Moldoveanu", ele="2544"),
                   mocks.node(104, R[n // 2][0] + .0005, R[n // 2][1], mountain_pass="yes", name="Fereastra Zmeilor", ele="2180"),
                   mocks.node(105, R[int(n * .7)][0], R[int(n * .7)][1] + .0012, tourism="alpine_hut", name="Cabana Podragu", ele="2136"),
                   mocks.node(106, R[int(n * .3)][0] + .0004, R[int(n * .3)][1], natural="spring"),
                   mocks.node(107, 45.5850, 24.5600, natural="peak", name="Vârful Negoiu", ele="2535")]
    await pg.fill("#hdate", "2027-07-10"); await pg.dispatch_event("#hdate", "input")
    await pg.select_option("#hdays", "2")
    await pg.locator("#buildbtn").scroll_into_view_if_needed()
    await pg.screenshot(path=SHOTS + "m_new_form.png")
    ok = await build_and_wait(pg)
    if not ok:
        await pg.screenshot(path=SHOTS + "m_build_err.png", full_page=True); print("\n".join(errs[:20])); return
    await pg.wait_for_timeout(3000)
    print("F0:", await pg.evaluate("window.__f0")); print("CAM:", await pg.evaluate("({aspect:V3.cam.aspect,w:V3.stage.clientWidth,h:V3.stage.clientHeight,pos:V3.cam.position.toArray().map(Math.round),polar:V3.cam.position.clone().sub(V3.ctl?V3.ctl.target:new THREE.Vector3()).normalize().y})"))
    await pg.screenshot(path=SHOTS + "m_view_top.png")
    # tap the route in 3D
    xy = await pg.evaluate("(()=>{const r=document.querySelector('#cv').getBoundingClientRect();return [r.left+r.width*.5,r.top+r.height*.5]})()")
    await pg.touchscreen.tap(xy[0], xy[1]); await pg.wait_for_timeout(800)
    print("M READOUT:", (await pg.inner_text("#readout")).replace("\n", " | "))
    await pg.evaluate("window.scrollTo(0, 420)"); await pg.wait_for_timeout(800)
    await pg.screenshot(path=SHOTS + "m_view_2.png")
    await pg.evaluate("window.scrollTo(0, document.querySelector('#brief').offsetTop-60)"); await pg.wait_for_timeout(600)
    await pg.screenshot(path=SHOTS + "m_view_brief.png")
    await pg.evaluate("window.scrollTo(0, document.querySelector('#prof').getBoundingClientRect().top+scrollY-140)"); await pg.wait_for_timeout(600)
    await pg.screenshot(path=SHOTS + "m_view_prof.png")
    await pg.evaluate("window.scrollTo(0, document.querySelector('#tbl').getBoundingClientRect().top+scrollY-80)"); await pg.wait_for_timeout(600)
    await pg.screenshot(path=SHOTS + "m_view_table.png")
    print("M BRIEF:", (await pg.inner_text("#brief"))[:1800].replace("\n", " | "))
    print("M TABLE:", (await pg.inner_text("#tbl tbody")).replace("\n", " | ").replace("\t", " "))
    print("CUT OFF LABELS:", await pg.evaluate("[...document.querySelectorAll('.plist li span,.rstats span,.kpis span')].filter(s=>s.offsetWidth&&s.scrollWidth>s.clientWidth+1).map(s=>s.textContent)") or "none")
    print("REQUESTS:", log)
    print("ERRORS:", "\n".join(errs[:30]) or "none")
    await b.close()

async def offline(p):
    b = await p.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = await b.new_context(viewport={"width": 1100, "height": 850}, ignore_https_errors=True)
    log, errs = [], []; await mock(ctx, log)
    pg = await ctx.new_page(); watch(pg, errs)
    await pg.goto(BASE + "#/", wait_until="load")
    await pg.evaluate("navigator.serviceWorker.ready.then(()=>true)"); await pg.wait_for_timeout(1500)
    await pg.reload(wait_until="load"); await pg.wait_for_timeout(1000)
    print("controlled:", await pg.evaluate("!!navigator.serviceWorker.controller"), "| caches:", await pg.evaluate("caches.keys()"))
    await pg.click("#hero [data-act=draw], #hero [data-act=new]"); await pg.wait_for_timeout(800)
    await pg.click("#tab-file"); await pg.set_input_files("#file", GPX); await pg.wait_for_timeout(800)
    await pg.fill("#hname", "Offline test"); await pg.fill("#hdate", "2027-08-14"); await pg.dispatch_event("#hdate", "input")
    if not await build_and_wait(pg): print("\n".join(errs[:20])); return
    await pg.click("#back"); await pg.wait_for_timeout(800)
    await ctx.set_offline(True)
    await pg.reload(wait_until="load"); await pg.wait_for_timeout(1500)
    print("OFFLINE HOME:", (await pg.inner_text("#hikes")).replace("\n", " | "))
    await pg.click(".hike"); await pg.wait_for_function("document.querySelector('#msg').hidden", timeout=60000); await pg.wait_for_timeout(2500)
    await pg.screenshot(path=SHOTS + "o_view.png")
    print("OFFLINE VIEW:", (await pg.inner_text("#figs")).replace("\n", " "), "| fc button hidden:", await pg.is_hidden("#fcbtn"))
    await pg.click("#back"); await pg.click("#hero [data-act=draw], #hero [data-act=new]"); await pg.wait_for_timeout(1500)
    await pg.screenshot(path=SHOTS + "o_new.png")
    print("ERRORS:", "\n".join(e for e in errs[:30] if "ERR_INTERNET_DISCONNECTED" not in e) or "none")
    await b.close()

async def main():
    async with async_playwright() as p:
        await {"desktop": desktop, "mobile": mobile, "offline": offline}[sys.argv[1]](p)

if __name__ == "__main__":
    asyncio.run(main())
