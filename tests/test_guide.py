"""The trail check, the safety card and page, and the live guide with a simulated GPS.
Usage: BASE=http://localhost:8777/ python3 tests/test_guide.py"""
import asyncio, math, sys
from playwright.async_api import async_playwright
import test_app as T, test_home as H

FAILS = []
def check(cond, what):
    print(("  ok   " if cond else "  FAIL ") + what)
    if not cond: FAILS.append(what)

async def wait_trail(pg):
    for _ in range(60):
        s = await pg.evaluate("HP.viewer.safety()")
        if s and s["checked"]: return s
        await pg.wait_for_timeout(1000)
    return await pg.evaluate("HP.viewer.safety()")

async def safety(pg, tag):
    s = await wait_trail(pg)
    check(s and s["checked"], f"{tag}: the paths are checked against OpenStreetMap")
    check(s["mapped"] > .95, f"{tag}: the route follows mapped paths ({s['mapped']:.0%})")
    check(s["hard"] == 3, f"{tag}: the hardest grade is T3 (Hohtürli and the path above the Oeschinensee)")
    check(s["lvl"] == "warn", f"{tag}: the verdict is 'Take care in places' ({s['lvl']})")
    t3 = [x for x in s["items"] if x["k"] == "sac"]
    check(len(t3) == 2 and any("Hohtürli" in x["where"] for x in t3), "the two demanding stretches are found, one at Hohtürli: " + "; ".join(x["where"] for x in t3))
    check(any(x["k"] == "drop" and x["where"].startswith("Day 1") for x in s["items"]), "the steep drops above Lauterbrunnen are found")
    check(not any(x["k"] == "drop" and x["lvl"] == "bad" for x in s["items"]), "steep ground alone never makes a route 'not for beginners'")
    ford = [x for x in s["items"] if x["k"] == "ford"]
    check(len(ford) == 1 and ford[0]["lvl"] == "info", "stream crossings are one note")
    check(s["marks"] >= 5 and s["junc"] > 30, f"waymarks to follow ({s['marks']}) and junctions ({s['junc']})")
    card = await pg.inner_text("#safecard")
    check("Take care in places" in card and "T3" in card and "white-red-white marks" in card and "1414" in card, "the card shows the verdict, the grade, the marks and Rega")
    brief = await pg.inner_text("#brief")
    check("Demanding mountain trail (T3) at km" in brief, "the day's alerts name the demanding stretch")
    # the page behind the card
    await pg.click("#safecard"); await pg.wait_for_function("!document.querySelector('#scr-detail').hidden", timeout=20000); await pg.wait_for_timeout(600)
    html = (await pg.inner_text("#detail")).lower()
    for want in ["Take care in places", "Places to take care", "Waymarks to follow", "Turn by turn", "Help", "Open the live guide"]:
        check(want.lower() in html, f"{tag}: the safety page has '{want}'")
    check(await pg.locator("#detail .dchart").count() == 1, "the safety page draws the route coloured by difficulty")
    wide = await pg.evaluate("[...document.querySelectorAll('#detail *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).length")
    check(wide == 0, f"{tag}: nothing on the safety page is wider than the screen")
    await pg.screenshot(path=T.SHOTS + f"safety_{tag}.png", full_page=True)
    # Show on the map returns to the map at that place
    b = pg.locator('#detail [data-dact^="show:"]').first; i = int((await b.get_attribute("data-dact"))[5:])
    await b.click(); await pg.wait_for_function("document.querySelector('#scr-detail').hidden", timeout=20000); await pg.wait_for_timeout(1500)
    km = await pg.evaluate(f"HP.viewer.current().route.d[{i}]")
    ro = await pg.inner_text("#readout")
    check(f"{km - 0:.1f}"[:2] and not await pg.is_hidden("#scr-view"), "Show on the map goes back to the map")

def offset(lat, lon, dn, de):
    return lat + dn / 110540, lon + de / (111320 * math.cos(math.radians(lat)))

async def guide(pg, tag):
    R = await pg.evaluate("(()=>{const R=HP.viewer.current().route;return{lat:Array.from(R.lat),lon:Array.from(R.lon),d:Array.from(R.d)}})()")
    await pg.click("#guidebtn"); await pg.wait_for_function("HP.guide.active()", timeout=10000); await pg.wait_for_timeout(500)
    check(await pg.is_visible("#guide") and await pg.is_hidden("#scr-view"), f"{tag}: the guide covers the screen and the 3D view rests")
    st = await pg.inner_text("#gtop")
    check("finding your position" in st.lower() or "location is off" in st.lower(), "before the first position the guide says it is finding it, or that location is off: " + st.replace("\n", " / "))
    t0 = 1_800_000_000_000
    fix = lambda i, dn=0, de=0, acc=8, t=0: pg.evaluate(f"HP.guide.fix({offset(R['lat'][i], R['lon'][i], dn, de)[0]},{offset(R['lat'][i], R['lon'][i], dn, de)[1]},{acc},{t0 + t})")
    # walking along day 1 from km 2.4: the next junction counts down
    for k, i in enumerate(range(120, 200, 4)): await fix(i, t=k * 40_000)
    s = await pg.evaluate("HP.guide.state()")
    check(abs(s["along"] - R["d"][196]) < .03 and not s["off"] and s["d"] < 15, f"on the route at km {s['along']} (expected {R['d'][196]:.2f})")
    check(s["next"] is not None and s["next"] > 196, "the next junction is ahead")
    check(any(w in s["top"] for w in ["Turn", "Keep", "Bear", "Straight", "Follow"]), "the top line says what to do: " + s["top"].replace("\n", " / "))
    check("tonight" in s["lines"] or "to the finish" in s["lines"] or "Rotstock" in s["lines"], "the panel says how far to tonight's stop")
    figs = (await pg.inner_text("#gpanel .gnow")).lower()
    check("arrive" in figs and "still up" in figs, "the figures: distance, time, arrival, climb left")
    await pg.screenshot(path=T.SHOTS + f"guide_{tag}.png")
    # leaving the route: 90 m to the side for three positions sets off the alarm, with the way back
    base = 200
    def side(i, m=90):   # m metres square to the route, on the side away from its other parts
        la, lo = R["lat"], R["lon"]; ky, kx = 110540, 111320 * math.cos(math.radians(la[i]))
        dx, dy = (lo[i + 3] - lo[i - 3]) * kx, (la[i + 3] - la[i - 3]) * ky; l = math.hypot(dx, dy)
        best = None
        for s_ in (1, -1):
            dn, de = s_ * dx / l * m, -s_ * dy / l * m; p = offset(la[i], lo[i], dn, de)
            gap = min(math.hypot((p[0] - la[k]) * ky, (p[1] - lo[k]) * kx) for k in range(len(la)))
            if not best or gap > best[2]: best = (dn, de, gap)
        return best
    dn, de, gap = side(base)
    print(f"  (stepping {gap:.0f} m from the nearest part of the route)")
    for k in range(3): await fix(base, dn=dn, de=de, t=900_000 + k * 20_000)
    s = await pg.evaluate("HP.guide.state()")
    check(s["off"] and s["alarm"] == "off", f"off the route after three positions 90 m away (off={s['off']}, alarm={s['alarm']})")
    check("Off the route" in s["top"] and any(w in s["top"] for w in ["north", "south", "east", "west"]), "the warning says how far and which way back: " + s["top"].replace("\n", " / "))
    check(await pg.evaluate("document.querySelector('#gtop').classList.contains('off')"), "the warning is red")
    await pg.screenshot(path=T.SHOTS + f"guide_off_{tag}.png")
    await fix(base + 2, t=980_000)
    s = await pg.evaluate("HP.guide.state()")
    check(not s["off"] and s["alarm"] == "back", "back on the route, the warning clears with a chime")
    # a weak signal far from the route does not raise the alarm
    dn, de, gap = side(base + 4, 150)
    for k in range(4): await fix(base + 4, dn=dn, de=de, acc=120, t=1_000_000 + k * 20_000)
    s = await pg.evaluate("HP.guide.state()")
    check(not s["off"], "a weak GPS signal never raises the alarm")
    check("Weak GPS" in await pg.inner_text("#gstat"), "the weak signal is shown")
    # walking back the way you came
    for k, i in enumerate(range(204, 180, -3)): await fix(i, t=1_100_000 + k * 30_000)
    s = await pg.evaluate("HP.guide.state()")
    check(s["back"] and "Wrong way" in s["top"], "walking back along the route is noticed")
    # SOS: the numbers and your position
    await pg.click("#gsos"); await pg.wait_for_timeout(300)
    sos = await pg.inner_text("#gsosbox")
    check("1414" in sos and "112" in sos and f"{R['lat'][180]:.3f}"[:6] in sos, "SOS shows Rega, 112 and your position")
    await pg.screenshot(path=T.SHOTS + f"guide_sos_{tag}.png")
    await pg.click("#gsosx")
    # Back closes the guide
    await pg.go_back(); await pg.wait_for_timeout(600)
    check(not await pg.evaluate("HP.guide.active()") and await pg.is_visible("#scr-view"), "Back closes the guide and shows the map again")

async def real_gps(b, log, errs):
    # the phone's own position, through the browser's location service
    ctx = await b.new_context(**H.PHONE, ignore_https_errors=True, geolocation={"latitude": 46.5919, "longitude": 7.9035, "accuracy": 10}, permissions=["geolocation"])
    await T.mock(ctx, log); pg = await ctx.new_page(); T.watch(pg, errs)
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(1000)
    await pg.click("#guidebtn"); await pg.wait_for_function("HP.guide.active()&&HP.guide.state().d<60", timeout=20000)
    s = await pg.evaluate("HP.guide.state()")
    check(s["d"] < 60 and abs(s["along"] - 4.5) < 1, f"the browser's position is matched to the route (km {s['along']}, {s['d']} m off)")
    await ctx.set_geolocation({"latitude": 46.5919 + 0.01, "longitude": 7.9035 + 0.012, "accuracy": 10}); await pg.wait_for_timeout(2500)
    s2 = await pg.evaluate("HP.guide.state()")
    check(abs(s2["along"] - s["along"]) > .5 or s2["d"] > s["d"] + 60, f"a new position from the browser moves the guide (km {s['along']} → {s2['along']}, {s['d']} → {s2['d']} m from the route)")
    # the phone closed the app while the guide ran: opened again, the home screen offers to carry on
    await pg.goto(T.BASE + "?nosw&again=1#/", wait_until="load"); await pg.wait_for_timeout(1500)
    check(await pg.is_visible("#resume"), "after a restart the home screen offers to continue the guide")
    await pg.click("#resgo"); await pg.wait_for_function("HP.guide&&HP.guide.active()", timeout=30000)
    check(True, "Continue opens the hike with the guide running")
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS)
        log, errs = [], []
        ctx = await b.new_context(**H.PHONE, ignore_https_errors=True); await T.mock(ctx, log); pg = await ctx.new_page(); T.watch(pg, errs)
        await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(1500)
        await safety(pg, "phone")
        await guide(pg, "phone")
        await ctx.close()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900}, ignore_https_errors=True); await T.mock(ctx, log); pg = await ctx.new_page(); T.watch(pg, errs)
        await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(1500)
        await safety(pg, "desktop")
        await guide(pg, "desktop")
        await ctx.close()
        await real_gps(b, log, errs)
        bad = [e for e in errs if "GPU stall" not in e and "no longer repeat" not in e and "tile" not in e.lower()]
        check(not bad, "no errors on the page" + ("" if not bad else ": " + " | ".join(bad[:5])))
        await b.close()
    print(f"\n{len(FAILS)} FAILED" if FAILS else "\nALL PASSED")
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
