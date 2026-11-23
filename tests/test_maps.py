"""The topographic maps: the Swiss national map in Switzerland, Esri's Outdoor map elsewhere, OpenTopoMap when Esri can't answer,
on the planning map, in the 3D view and in the live guide. Esri's tiles are made-up pictures (tests/esri_outdoor_mock.png).
Usage: BASE=http://localhost:8777/ python3 tests/test_maps.py"""
import asyncio, json, math, os, sys, tempfile
from playwright.async_api import async_playwright
import test_app as T, test_home as H

FAILS = []
def check(cond, what):
    print(("  ok   " if cond else "  FAIL ") + what)
    if not cond: FAILS.append(what)

SW, ES, OT = "pixelkarte-farbe", "static-map-tiles-api.arcgis.com", "tile.opentopomap.org"
REFUSE = dict(status=498, content_type="application/json", body='{"error":{"code":498,"message":"Invalid token."}}')

def fagaras_gpx():
    """A walk along the Făgăraș ridge in Romania, from Bâlea Lac towards Podragu."""
    wps = [(45.6036, 24.6175), (45.5965, 24.6285), (45.5905, 24.6440), (45.5880, 24.6610), (45.5895, 24.6800), (45.5930, 24.6990), (45.5960, 24.7170), (45.6007, 24.7364), (45.5990, 24.7560), (45.5975, 24.7775)]
    pts = []
    for (a, b), (c, d) in zip(wps, wps[1:]):
        n = max(1, int(math.hypot((c - a) * 111.2, (d - b) * 111.2 * math.cos(math.radians(a))) / .15))
        pts += [(a + (c - a) * i / n + .0006 * math.sin(i / n * math.pi * 3), b + (d - b) * i / n) for i in range(n)]
    pts.append(wps[-1])
    f = tempfile.NamedTemporaryFile("w", suffix=".gpx", delete=False)
    f.write('<?xml version="1.0"?>\n<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Fagaras ridge</name><trkseg>\n'
            + "".join(f'<trkpt lat="{la:.6f}" lon="{lo:.6f}"></trkpt>\n' for la, lo in pts) + "</trkseg></trk></gpx>\n")
    f.close(); return f.name

async def context(b, log, **kw):
    ctx = await b.new_context(ignore_https_errors=True, **kw); await T.mock(ctx, log)
    async def otm(r): await r.fulfill(status=200, content_type="image/png", body=T.ESRI_PNG)
    await ctx.route(f"https://*.{OT}/**", otm)   # OpenTopoMap answers with a made-up picture too, so the fallback is seen to work
    return ctx

def counter(pg):
    urls = []
    pg.on("request", lambda r: urls.append(r.url) if any(k in r.url for k in (SW, ES, OT)) else None)
    return urls

async def plan_at(pg, urls, center, zoom, tag):
    await pg.goto(T.BASE + "?nosw#/", wait_until="load")
    await pg.evaluate(f"localStorage.setItem('hp-view',JSON.stringify({{center:{json.dumps(center)},zoom:{zoom}}}))")
    urls.clear(); await pg.goto(T.BASE + f"?nosw&m={tag}#/new", wait_until="load"); await pg.wait_for_timeout(3500)
    credit = await pg.evaluate("(document.querySelector('#pmap .leaflet-control-attribution')||{}).innerText||''")
    n = lambda k: sum(k in u for u in urls)
    return n(SW), n(ES), n(OT), credit

async def planning(b):
    print("Planning map")
    log, errs = [], []
    ctx = await context(b, log, **H.PHONE); pg = await ctx.new_page(); T.watch(pg, errs); urls = counter(pg)
    sw, es, ot, cr = await plan_at(pg, urls, [46.53, 7.80], 13, "ch")
    check(sw > 0 and es == 0 and ot == 0, f"in Switzerland the planning map is the Swiss national map ({sw} Swiss tiles, {es} Esri, {ot} OpenTopoMap)")
    check(all("/14/" in u for u in urls if SW in u), "the Swiss tiles come one zoom closer, at twice the detail")
    check(cr.strip() == "Map © swisstopo", f"its credit is swisstopo's: {cr!r}")
    sw, es, ot, cr = await plan_at(pg, urls, [45.60, 24.64], 13, "ro")
    check(es > 0 and sw == 0 and ot == 0, f"in Romania it is Esri's Outdoor map ({es} tiles)")
    check(all("/arcgis/outdoor/static/tile/12/" in u for u in urls if ES in u), "Esri's 512-pixel tiles come one zoom out, with the detail of the map's own zoom")
    check("Powered by Esri" in cr and "OpenStreetMap" in cr and "swisstopo" not in cr, f"its credit is Esri's: {cr[:60]!r}")
    sw, es, ot, cr = await plan_at(pg, urls, [46.0, 7.75], 12, "border")
    check(sw > 0 and es > 0, f"at the border each tile comes from the map that has it ({sw} Swiss, {es} Esri)")
    check("swisstopo" in cr and "Powered by Esri" in cr, "and both credits show")
    sw, es, ot, cr = await plan_at(pg, urls, [46.8, 8.2], 9, "far")
    check(sw == 0 and es > 0, f"zoomed out over Switzerland it is one map, Esri's ({sw} Swiss tiles)")
    check(not [e for e in errs if "GPU" not in e], "no errors: " + "; ".join(errs[:3]))
    await ctx.close()

    # Esri refuses (an expired key, the month's allowance used up): three refusals and OpenTopoMap takes over
    ctx = await context(b, log, **H.PHONE)
    async def refuse(r): await r.fulfill(**REFUSE)
    await ctx.route(f"https://{ES}/**", refuse)
    pg = await ctx.new_page(); urls = counter(pg)
    sw, es, ot, cr = await plan_at(pg, urls, [45.60, 24.64], 13, "refused")
    off = await pg.evaluate("HP.maps.esriOff")
    check(off and ot > 0, f"when Esri says no three times, OpenTopoMap takes over ({ot} tiles)")
    check("OpenTopoMap" in cr and "Esri" not in cr, f"with its own credit: {cr[:60]!r}")
    await ctx.close()

    # no connection to Esri at all (a phone without signal): that is not Esri's refusal, so nothing is switched off
    ctx = await context(b, log, **H.PHONE)
    async def lost(r): await r.abort()
    await ctx.route(f"https://{ES}/**", lost)
    pg = await ctx.new_page(); urls = counter(pg)
    sw, es, ot, cr = await plan_at(pg, urls, [45.60, 24.64], 13, "lost")
    check(not await pg.evaluate("HP.maps.esriOff") and ot == 0, "a lost connection doesn't count against Esri")
    await ctx.close()

async def swiss_hike(b):
    print("3D view and live guide in Switzerland (the Bärentrek)")
    log, errs = [], []
    ctx = await context(b, log, viewport={"width": 1280, "height": 900}); pg = await ctx.new_page(); T.watch(pg, errs); urls = counter(pg)
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(1500)
    check(await pg.evaluate("HP.viewer.current().topoSrc") == "swisstopo", "a hike wholly in Switzerland keeps the Swiss map as its offline map")
    urls.clear(); await pg.click('#mapseg button[data-map="topo"]')
    await pg.wait_for_function("document.querySelector('#attrib-topo')&&!document.querySelector('#attrib-topo').hidden", timeout=10000); await pg.wait_for_timeout(6000)
    sw, es = sum(SW in u for u in urls), sum(ES in u for u in urls)
    check(sw >= 4 and es == 0, f"the Topo style loads the Swiss map at every distance ({sw} Swiss tiles, {es} Esri)")
    check(await pg.inner_text("#attrib-topo") == "Map © swisstopo", "with swisstopo's credit under the map")
    check(await pg.is_hidden("#attrib"), "and not the satellite credit")
    await pg.locator("#stage").screenshot(path=os.path.join(T.SHOTS, "maps_3d_swiss.png"))
    await pg.click('#mapseg button[data-map="sat"]'); await pg.wait_for_timeout(500)
    check(await pg.is_hidden("#attrib-topo") and await pg.is_visible("#attrib"), "the satellite style shows its own credit instead")

    urls.clear(); await pg.click("#guidebtn"); await pg.wait_for_function("HP.guide.active()", timeout=10000); await pg.wait_for_timeout(3000)
    z = await pg.evaluate("""(()=>{const m=document.querySelector('#gmap');const p=m.querySelector('.leaflet-pane.leaflet-pic-pane'),t=m.querySelector('.leaflet-tile-pane');
      return{pic:p?+getComputedStyle(p).zIndex:null,tiles:t?+getComputedStyle(t).zIndex:null,img:!!(p&&p.querySelector('img'))}})()""")
    check(z["img"] and z["pic"] is not None and z["pic"] < z["tiles"], f"the guide's offline picture lies under the live map ({z})")
    check(sum(SW in u for u in urls) > 0, "and with a connection the Swiss map loads over it")
    await pg.screenshot(path=os.path.join(T.SHOTS, "maps_guide_swiss.png"))
    check(not [e for e in errs if "GPU" not in e], "no errors: " + "; ".join(errs[:3]))
    await ctx.close()

async def romanian_hike(b):
    print("3D view in Romania (the Făgăraș ridge)")
    log, errs = [], []
    ctx = await context(b, log, viewport={"width": 1280, "height": 900}); pg = await ctx.new_page(); T.watch(pg, errs); urls = counter(pg)
    gpx = fagaras_gpx()
    try:
        await pg.goto(T.BASE + "?nosw#/new", wait_until="load"); await pg.wait_for_timeout(600)
        await pg.click("#tab-file"); await pg.set_input_files("#file", gpx); await pg.wait_for_timeout(500)
        await pg.fill("#hdate", "2027-07-20"); await pg.dispatch_event("#hdate", "input")
        await T.build_and_wait(pg); await pg.wait_for_timeout(1500)
    finally: os.unlink(gpx)
    check(await pg.evaluate("HP.viewer.current().topoSrc") == "otm", "outside Switzerland the offline map is OpenTopoMap (Esri's may not be kept)")
    urls.clear(); await pg.click('#mapseg button[data-map="topo"]'); await pg.wait_for_timeout(7000)
    es, sw = sum(ES in u for u in urls), sum(SW in u for u in urls)
    check(es > 0 and sw == 0, f"the Topo style loads Esri's Outdoor map ({es} tiles)")
    check("Powered by Esri" in await pg.inner_text("#attrib-topo"), "with Esri's credit")
    await pg.locator("#stage").screenshot(path=os.path.join(T.SHOTS, "maps_3d_esri.png"))
    await ctx.unroute(f"https://{ES}/**")
    async def refuse(r): await r.fulfill(**REFUSE)
    await ctx.route(f"https://{ES}/**", refuse)
    urls.clear(); await pg.evaluate("V3.orbitAt(300,1500,30,0.9)"); await pg.wait_for_timeout(7000)
    toast = await pg.evaluate("(document.querySelector('#toast')||{}).innerText||''")
    check(await pg.evaluate("HP.maps.esriOff") and "ArcGIS" in toast, f"when Esri says no, the 3D view says so once: {toast[:70]!r}")
    check(sum(OT in u for u in urls) > 0, "and falls back to OpenTopoMap")
    check(not [e for e in errs if "GPU" not in e and "498" not in e and "nominatim" not in e and "ERR_FAILED" not in e], "no errors: " + "; ".join(errs[:3]))
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS)
        await planning(b); await swiss_hike(b); await romanian_hike(b)
        await b.close()
    print("ALL OK" if not FAILS else f"{len(FAILS)} FAILED")
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
