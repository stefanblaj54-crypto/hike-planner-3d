"""When an online service is down, refuses or hangs, the app says so plainly, carries on without it where it can, and never
gets stuck: building a hike, drawing a route, the trail check, Cancel, map tiles in 3D, and memory over many opens.
Network waits are cut to a tenth (localStorage hp-tmul) so a hanging server is given up on quickly.
Usage: BASE=http://localhost:8777/ python3 tests/test_resilience.py"""
import asyncio, json, sys, time, urllib.parse
from playwright.async_api import async_playwright
import test_app as T, test_home as H

FAILS = []
def check(cond, what):
    print(("  ok   " if cond else "  FAIL ") + what)
    if not cond: FAILS.append(what)

HOSTS = {'terrain': ['https://s3.amazonaws.com/elevation-tiles-prod/**'], 'eox': ['https://tiles.maps.eox.at/**'],
         'swiss': ['https://wmts.geo.admin.ch/**'], 'overpass': ['https://overpass-api.de/**', 'https://overpass.kumi.systems/**'],
         'meteo': ['https://api.open-meteo.com/**', 'https://ensemble-api.open-meteo.com/**', 'https://archive-api.open-meteo.com/**']}

async def broken(b, svc, mode, **kw):
    log = []
    ctx = await b.new_context(ignore_https_errors=True, **(kw or {"viewport": {"width": 1100, "height": 850}})); await T.mock(ctx, log)
    async def h(r):
        if mode == 'down': await r.fulfill(status=503, content_type='text/plain', body='Service unavailable')
        elif mode == 'refused': await r.abort('connectionrefused')
        # 'hang': never answered
    if svc:
        for p in HOSTS[svc]: await ctx.route(p, h)
    pg = await ctx.new_page(); errs = []; T.watch(pg, errs)
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await pg.evaluate("localStorage.setItem('hp-tmul','0.1')")
    return ctx, pg, errs

async def build(pg, date="2027-07-15"):
    await pg.goto(T.BASE + "?nosw&t=1#/new", wait_until="load"); await pg.wait_for_timeout(600)
    await pg.click("#tab-file"); await pg.set_input_files("#file", T.GPX); await pg.wait_for_timeout(400)
    await pg.fill("#hdate", date); await pg.dispatch_event("#hdate", "input"); await pg.select_option("#hdays", "3")
    t0 = time.time(); await pg.click("#buildbtn"); res, err = 'stuck', ''
    while time.time() - t0 < 120:
        await pg.wait_for_timeout(800)
        if await pg.is_visible("#scr-view"): res = 'built'; break
        err = await pg.evaluate("document.querySelector('#berr').hidden?'':document.querySelector('#berr').textContent")
        if err: res = 'error'; break
    steps = await pg.evaluate("Object.fromEntries([...document.querySelectorAll('#steps li')].map(l=>[l.dataset.k,l.className+'|'+l.querySelector('small').textContent]))")
    return res, err, steps, time.time() - t0

async def building(b):
    print("Building a hike with one service failing")
    for svc, mode in [('terrain', 'down'), ('terrain', 'hang')]:
        ctx, pg, errs = await broken(b, svc, mode); res, err, steps, dt = await build(pg)
        check(res == 'error' and 'terrain heights' in err and steps['terrain'].startswith('fail'), f"terrain {mode}: a clear error, the step marked as failed, Try again ({dt:.0f}s): {err[:70]}")
        check(await pg.is_visible('#bagain'), "  and a Try again button")
        await ctx.close()
    for svc, mode, want in [('eox', 'down', 'no satellite'), ('eox', 'hang', 'no satellite'), ('swiss', 'down', '')]:
        ctx, pg, errs = await broken(b, svc, mode); res, err, steps, dt = await build(pg)
        check(res == 'built' and want in steps['map'] and dt < 60, f"{svc} {mode}: the hike is built without it in {dt:.0f}s ({steps['map']})")
        if svc == 'swiss': check(await pg.evaluate("HP.viewer.current().topoSrc") == 'otm', "  the Swiss map's place is taken by OpenTopoMap")
        await ctx.close()
    for svc, mode in [('overpass', 'down'), ('overpass', 'hang'), ('meteo', 'down'), ('meteo', 'hang')]:
        ctx, pg, errs = await broken(b, svc, mode); res, err, steps, dt = await build(pg, "2026-11-26" if svc == 'meteo' else "2027-07-15")
        what = steps['places'] if svc == 'overpass' else steps['weather']
        check(res == 'built' and dt < 60, f"{svc} {mode}: built without it in {dt:.0f}s ({what})")
        logged = await pg.evaluate("HP.log.list().map(l=>l.k+' '+l.w+' '+l.m).join(' / ')")
        check(svc[:5] in logged or 'open-meteo' in logged or 'overpass' in logged, "  and the problem is noted for 'Copy problem details'")
        await ctx.close()

async def drawing(b):
    print("Drawing a route while the trail router is down, hangs, then answers")
    ctx = await b.new_context(viewport={"width": 1100, "height": 850}, ignore_https_errors=True); await T.mock(ctx, [])
    state = {'m': 'down'}
    async def br(r):
        if state['m'] == 'down': await r.fulfill(status=503, body='busy')
        elif state['m'] == 'ok': await r.fallback()
    await ctx.route("https://brouter.de/**", br)
    pg = await ctx.new_page(); T.watch(pg, [])
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await pg.evaluate("localStorage.setItem('hp-tmul','0.1');localStorage.setItem('hp-view',JSON.stringify({center:[45.6,24.66],zoom:13}))")
    await pg.goto(T.BASE + "?nosw&d=1#/new", wait_until="load"); await pg.wait_for_timeout(1500)
    for la, lo in [(45.6036, 24.6168), (45.5947, 24.6476)]:
        xy = await pg.evaluate(f"(()=>{{const p=HP.dbg.map().latLngToContainerPoint([{la},{lo}]);const r=document.querySelector('#pmap').getBoundingClientRect();return [p.x+r.left,p.y+r.top]}})()")
        await pg.mouse.click(xy[0], xy[1]); await pg.wait_for_timeout(500)
    await pg.wait_for_function("HP.dbg.NEW.routed||HP.dbg.NEW.err", timeout=30000)
    t = await pg.inner_text("#rstats")
    check('busy or down' in t and await pg.is_visible("#rretry"), f"router down: said plainly, with Try again: {t[:60]!r}")
    state['m'] = 'hang'; t0 = time.time(); await pg.click("#rretry")
    await pg.wait_for_function("HP.dbg.NEW.routed||HP.dbg.NEW.err", timeout=60000)
    check('too long' in await pg.inner_text("#rstats"), f"router hangs: given up on after {time.time()-t0:.0f}s, with Try again")
    state['m'] = 'ok'; await pg.click("#rretry"); await pg.wait_for_function("HP.dbg.NEW.routed", timeout=30000)
    check('km' in await pg.inner_text("#rstats"), "router back: Try again finds the route")
    await ctx.close()

async def trail_cancel_tiles(b):
    print("The trail check down then back, Cancel during a hang, map tiles that hang then come back")
    ctx = await b.new_context(viewport={"width": 1100, "height": 850}, ignore_https_errors=True); await T.mock(ctx, [])
    state = {'ovp': 'down', 'swiss': 'ok'}
    async def ov(r):
        if state['ovp'] == 'down' and '["highway"]' in urllib.parse.unquote_plus(r.request.post_data or ''):
            await r.fulfill(status=504, body='Gateway timeout'); return
        await r.fallback()
    await ctx.route("https://overpass-api.de/**", ov); await ctx.route("https://overpass.kumi.systems/**", ov)
    pg = await ctx.new_page(); T.watch(pg, [])
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await pg.evaluate("localStorage.setItem('hp-tmul','0.1')")
    await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(1000)
    for _ in range(30):
        if await pg.is_visible('#safecard [data-act="trailretry"]'): break
        await pg.wait_for_timeout(1000)
    check(await pg.is_visible('#safecard [data-act="trailretry"]'), "trail check down: the safety card says so, with Try again")
    state['ovp'] = 'ok'; await pg.click('#safecard [data-act="trailretry"]')
    for _ in range(60):
        s = await pg.evaluate("HP.viewer.safety()")
        if s and s.get('checked'): break
        await pg.wait_for_timeout(1000)
    check(s and s.get('checked') and s.get('hard') == 3, "trail check back: Try again checks the paths")
    # map tiles that hang, then answer: they load once the phone is back online
    async def sw(r):
        if state['swiss'] == 'hang' and 'pixelkarte' in r.request.url: return
        await r.fallback()
    await ctx.route("https://wmts.geo.admin.ch/**", sw); state['swiss'] = 'hang'
    await pg.click('#mapseg button[data-map="topo"]'); await pg.wait_for_timeout(5000)
    st = await pg.evaluate("V3.tiles()")
    check(st['own'] == 0, f"Swiss tiles hanging: the saved picture shows ({st['ts']})")
    state['swiss'] = 'ok'; await pg.evaluate("dispatchEvent(new Event('online'))")
    for _ in range(40):
        st = await pg.evaluate("V3.tiles()")
        if st['own'] >= st['onScreen']: break
        await pg.wait_for_timeout(1500)
    check(st['own'] >= st['onScreen'], f"back online: every tile on screen loads its map ({st['own']} of {st['onScreen']})")
    # Cancel during a build that hangs answers at once
    async def hang(r): return
    await ctx.route("https://s3.amazonaws.com/elevation-tiles-prod/**", hang)
    await pg.evaluate("localStorage.setItem('hp-tmul','10')")
    await pg.goto(T.BASE + "?nosw&c=1#/new", wait_until="load"); await pg.wait_for_timeout(600)
    await pg.click("#tab-file"); await pg.set_input_files("#file", T.GPX); await pg.wait_for_timeout(400)
    await pg.click("#buildbtn"); await pg.wait_for_timeout(2500)
    t0 = time.time(); await pg.click("#bcancel"); await pg.wait_for_function("!document.querySelector('#scr-new').hidden", timeout=10000)
    check(time.time() - t0 < 2, f"Cancel during a hang: back on the form in {time.time()-t0:.2f}s")
    await pg.evaluate("localStorage.removeItem('hp-tmul')")
    await ctx.close()

async def memory(b):
    print("Opening the same hike many times")
    ctx = await b.new_context(viewport={"width": 1100, "height": 850}, ignore_https_errors=True); await T.mock(ctx, [])
    pg = await ctx.new_page(); T.watch(pg, [])
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(1500)
    hid = await pg.evaluate("decodeURIComponent(location.hash.split('/')[2]||'')")
    heap = []
    for k in range(8):
        await pg.evaluate("location.hash='#/'"); await pg.wait_for_timeout(1200)
        await pg.evaluate(f"location.hash='#/hike/'+encodeURIComponent({json.dumps(hid)})"); await pg.wait_for_timeout(3500)
        heap.append(await pg.evaluate("performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):0"))
    check(heap[-1] < max(heap[:3]) * 1.6 + 20, f"memory stays level over 8 opens (MB: {heap})")
    await ctx.close()

async def main():
    which = sys.argv[1:] or ['all']
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS + ['--enable-precise-memory-info'])
        if 'all' in which or 'build' in which: await building(b)
        if 'all' in which or 'draw' in which: await drawing(b)
        if 'all' in which or 'trail' in which: await trail_cancel_tiles(b)
        if 'all' in which or 'memory' in which: await memory(b)
        await b.close()
    print("ALL OK" if not FAILS else f"{len(FAILS)} FAILED")
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
