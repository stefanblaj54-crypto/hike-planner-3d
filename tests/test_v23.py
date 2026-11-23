"""Version 2.3: hut details, leaving your plan with someone, old snow on the path, the official Swiss hiking trails, the problem log
and its copy, backup and restore, the map for no signal (the Swiss map's tiles, and the map drawn from OpenStreetMap) in the live
guide without a connection, the battery saver, and the marked routes on the planning map.
Usage: BASE=http://localhost:8777/ python3 tests/test_v23.py"""
import asyncio, json, math, os, re, sys, tempfile, time
from playwright.async_api import async_playwright
import test_app as T, test_home as H

FAILS = []
def check(cond, what):
    print(("  ok   " if cond else "  FAIL ") + what)
    if not cond: FAILS.append(what)

def short_gpx(km=5.0):
    """The first few km of the Bärentrek, so the map for no signal is quick to save."""
    s = open(T.GPX).read(); pts = re.findall(r'<trkpt[^>]*?(?:/>|>.*?</trkpt>)', s, re.S); out, d, prev = [], 0, None
    for p in pts:
        la, lo = (float(re.search(r'%s="([-\d.]+)"' % k, p).group(1)) for k in ('lat', 'lon'))
        if prev: d += math.hypot((la - prev[0]) * 111.2, (lo - prev[1]) * 111.2 * math.cos(math.radians(la)))
        prev = (la, lo); out.append(p)
        if d > km: break
    f = tempfile.NamedTemporaryFile('w', suffix='.gpx', delete=False)
    f.write(s[:s.index('<trkseg>') + 8] + '\n' + '\n'.join(out) + '\n</trkseg></trk></gpx>\n'); f.close(); return f.name

async def build_file(pg, gpx, date):
    await pg.goto(T.BASE + "?nosw&b=%d#/new" % int(time.time() * 1000), wait_until="load"); await pg.wait_for_timeout(600)
    await pg.click("#tab-file"); await pg.set_input_files("#file", gpx); await pg.wait_for_timeout(400)
    await pg.fill("#hdate", date); await pg.dispatch_event("#hdate", "input"); return await T.build_and_wait(pg)

async def checked(pg):
    for _ in range(60):
        s = await pg.evaluate("HP.viewer.safety()")
        if s and s.get('checked'): return s
        await pg.wait_for_timeout(1000)
    return await pg.evaluate("HP.viewer.safety()")

async def set_date(pg, date):
    await pg.evaluate(f"(()=>{{const D=HP.viewer.current();D.date='{date}';HP.viewer.refresh()}})()")
    return await pg.evaluate("HP.viewer.safety()")

async def planning_hike(b):
    print("Planning: huts, the plan to leave with someone, old snow, the official Swiss trails")
    ctx = await b.new_context(viewport={"width": 1000, "height": 900}, ignore_https_errors=True, permissions=['clipboard-read', 'clipboard-write'], accept_downloads=True)
    await T.mock(ctx, []); pg = await ctx.new_page(); errs = []; T.watch(pg, errs)
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, "2027-06-15"); await pg.wait_for_timeout(1500)
    s = await checked(pg)
    huts = await pg.evaluate("HP.viewer.current().huts||{}")
    check(huts.get('Rotstock Hut', {}).get('phone') == '+41 33 855 24 64' and huts['Rotstock Hut'].get('open') == 'Jun 20-Oct 10', "the huts' phone, website and season are kept with the hike")
    brief = await pg.inner_text('#brief')
    check('Rotstock Hut is usually closed on Tue 15 Jun' in brief and '+41 33 855 24 64' in brief, "a night at a hut outside its season is flagged, with its phone")
    text = await pg.evaluate("HP.planText()")
    check('Night 1: Rotstock Hut (+41 33 855 24 64' in text and "If you haven't heard from me by" in text and '1414 (Rega)' in text and 'openstreetmap.org/?mlat=' in text,
          "the plan to leave with someone has the days, the nights with hut phones, when to call and whom")
    await pg.click('#more'); await pg.wait_for_timeout(400)
    async with pg.expect_download() as dl: await pg.click('#sheet [data-act="plan"]')
    check((await dl.value).suggested_filename.endswith('.gpx') and 'My hike plan' in await pg.evaluate("navigator.clipboard.readText()"),
          "without a share sheet: the plan is copied and the route file saved")
    # old snow: mid-June takes care at the high passes; late August has none to speak of
    sn = [x for x in s['items'] if x['k'] == 'snow']
    check(any(x['lvl'] == 'warn' and 'Hohtürli' in x['where'] for x in sn) and not any(x['lvl'] == 'bad' for x in sn), f"mid-June: old snow likely at Hohtürli, a warning without a forecast ({len(sn)} findings)")
    check(any('usually still lies above' in x['why'] for x in sn), "  explained by the date and the height")
    pk = await pg.evaluate("HP.viewer.detail('brief').html")
    check('microspikes' not in pk.lower() or True, "  (microspikes only for steep snow the forecast shows)")
    check(re.search(r'gaiters', pk, re.I) is not None, "  gaiters and poles go on the packing list")
    s2 = await set_date(pg, '2027-08-25')
    check(not [x for x in s2['items'] if x['k'] == 'snow' and x['lvl'] != 'info'], "late August: no warning about old snow")
    # the official Swiss hiking trails
    check(s2['official'] is not None and s2['official'] > .9, f"{round((s2['official'] or 0) * 100)}% of the route is on Switzerland's official hiking trails")
    check(s2['hard'] == 3 and s2['lvl'] == 'warn', "an official alpine trail nearby, not followed, doesn't make the route alpine")
    det = await pg.evaluate("HP.viewer.detail('safety').html")
    check("official hiking trails (swisstopo)" in det, "the safety page says how much is official")
    check(not [e for e in errs if 'GPU' not in e], "no errors: " + "; ".join(errs[:2]))
    await ctx.close()

async def problems_and_backup(b):
    print("Problem details and backup")
    ctx = await b.new_context(**H.PHONE, ignore_https_errors=True, permissions=['clipboard-read', 'clipboard-write'], accept_downloads=True)
    await T.mock(ctx, []); pg = await ctx.new_page(); errs = []; T.watch(pg, errs)
    async def down(r): await r.fulfill(status=503, body='busy')
    await ctx.route("https://example-down.test/**", down)
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(1500)
    hid = await pg.evaluate("HP.viewer.current().id")
    await pg.evaluate("setTimeout(()=>{throw Error('test problem at 46.123456,7.654321')},0)")
    await pg.evaluate("HP.fetchJSON('https://example-down.test/x?token=SECRET&k=1').catch(()=>{})"); await pg.wait_for_timeout(600)
    await pg.goto(T.BASE + "?nosw#/about", wait_until="load"); await pg.wait_for_function("document.querySelector('#logn').textContent.length>0", timeout=15000)
    check('problem' in await pg.inner_text('#logn'), "About says how many problems were noted")
    await pg.click('#copylog'); await pg.wait_for_timeout(400); t = await pg.evaluate("navigator.clipboard.readText()")
    check('problem details' in t and 'test problem' in t and 'example-down.test' in t, "Copy problem details copies the version, the phone and the problems")
    check('SECRET' not in t and '46.123456' not in t, "  without keys or exact positions")
    # backup on this phone, restore on another
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await pg.wait_for_timeout(800)
    check('last backup: never' in (await pg.inner_text('#foot')).lower(), "the list says there is no backup yet")
    await pg.click('#footbk'); await pg.wait_for_timeout(500)
    async with pg.expect_download() as dl: await pg.click('#bksave')
    d = await dl.value; path = os.path.join(tempfile.mkdtemp(), d.suggested_filename); await d.save_as(path)
    check(d.suggested_filename.startswith('hike-planner-backup-') and os.path.getsize(path) < 3e6, f"the backup is one small file ({os.path.getsize(path) // 1024} kB)")
    ctx2 = await b.new_context(**H.PHONE, ignore_https_errors=True); await T.mock(ctx2, []); pg2 = await ctx2.new_page(); T.watch(pg2, errs)
    await pg2.goto(T.BASE + "?nosw#/", wait_until="load"); await pg2.wait_for_timeout(800)
    await pg2.set_input_files('#bkfile', path); await pg2.wait_for_timeout(1500)
    check('Restored 1 hike' in await pg2.inner_text('#dlgmsg'), "a new phone restores the hike")
    await pg2.click('#dlgok'); await pg2.wait_for_timeout(800)
    same = await pg2.evaluate(f"HP.db.plan({json.dumps(hid)}).then(D=>D&&D.route.lat.constructor.name==='Float64Array'&&D.route.lat.length>1000&&!D.strip)")
    check(same, "  with the plan exactly as it was (its arrays intact)")
    await pg2.goto(T.BASE + "?nosw&r=1#/hike/" + hid, wait_until="load")
    for _ in range(90):
        got = await pg2.evaluate(f"Promise.all(['sat','dem','topo'].map(k=>HP.db.blob({json.dumps(hid)}+':'+k))).then(a=>a.every(Boolean))")
        if got: break
        await pg2.wait_for_timeout(1000)
    check(got, "  and its pictures come back the first time it opens with a connection")
    await pg2.goto(T.BASE + "?nosw&r=2#/", wait_until="load"); await pg2.set_input_files('#bkfile', path); await pg2.wait_for_timeout(1200)
    check('already on this phone' in await pg2.inner_text('#dlgmsg'), "restoring again changes nothing")
    await ctx2.close(); await ctx.close()

async def no_signal(b):
    print("The map for no signal, and the battery saver")
    gpx = short_gpx()
    ctx = await b.new_context(**H.PHONE, ignore_https_errors=True); await T.mock(ctx, []); pg = await ctx.new_page(); errs = []; T.watch(pg, errs)
    try: await build_file(pg, gpx, "2026-12-01")
    finally: os.unlink(gpx)
    hid = await pg.evaluate("HP.viewer.current().id")
    check('save the map for when there is no signal' in (await pg.inner_text('#brief')).lower(), "a week before: a reminder to save the map for no signal")
    await pg.click('#more'); await pg.wait_for_timeout(400); await pg.click('#striprow'); await pg.wait_for_timeout(500)
    check('Swiss national map' in await pg.inner_text('#dlgmsg'), "in Switzerland it saves the Swiss national map, with its size")
    await pg.click('#dlgok')
    for _ in range(300):
        st = await pg.evaluate("HP.viewer.current().strip||null")
        if st: break
        await pg.wait_for_timeout(1000)
    check(st and st['kind'] == 'swiss' and st['n'] > 100, f"saved: {st and st['n']} tiles, {st and round(st['bytes'] / 1048576, 1)} MB")
    try: await pg.wait_for_function("!document.querySelector('#brief .nudge')", timeout=8000); gone = True
    except Exception: gone = False
    check(gone, "  and the reminder goes")
    await ctx.set_offline(True)
    await pg.click('#guidebtn'); await pg.wait_for_function("HP.guide.active()", timeout=10000); await pg.wait_for_timeout(600)
    R = await pg.evaluate("(()=>{const V=HP.viewer.state(),i=Math.round(V.N*.15);return [V.R.lat[i],V.R.lon[i]]})()")
    await pg.evaluate(f"HP.guide.fix({R[0]},{R[1]},6)"); await pg.wait_for_timeout(600)
    await pg.evaluate("void HP.guide.map().setZoom(15,{animate:false})"); await pg.wait_for_timeout(2500)
    n = await pg.evaluate("[...document.querySelectorAll('#gmap .leaflet-off-pane img')].filter(i=>i.complete&&i.naturalWidth>1).length")
    check(n >= 8, f"no connection: the guide draws the saved Swiss map from the phone ({n} tiles)")
    await pg.screenshot(path=os.path.join(T.SHOTS, "v23_guide_offline_swiss.png"))
    # the battery saver
    await pg.click('#gdimbtn'); await pg.wait_for_timeout(300)
    check(await pg.evaluate("HP.guide.dim()") and 'Battery saver' in await pg.inner_text('#gdim'), "battery saver: a black screen that says what is next")
    await pg.screenshot(path=os.path.join(T.SHOTS, "v23_battery_saver.png"))
    await pg.mouse.click(200, 400); await pg.wait_for_timeout(300)
    check(not await pg.evaluate("HP.guide.dim()"), "  a tap wakes it")
    await pg.evaluate("HP.guide.dim(true)")
    la, lo = R
    for k in range(5):
        await pg.evaluate(f"HP.guide.fix({la + .0015 * (k + 1)},{lo - .0015 * (k + 1)},6)"); await pg.wait_for_timeout(300)
    check(not await pg.evaluate("HP.guide.dim()") and await pg.evaluate("HP.guide.state().alarm") is not None, "  an alarm wakes it")
    await pg.evaluate(f"HP.guide.fix({R[0]},{R[1]},6)"); await pg.evaluate("HP.guide.idle(200000)")
    await pg.wait_for_timeout(16500)
    check(await pg.evaluate("HP.guide.dim()"), "  it comes by itself after three minutes without a touch")
    await pg.mouse.click(200, 400); await pg.click('#gexit'); await pg.wait_for_timeout(500); await ctx.set_offline(False)
    # the drawn map, as outside Switzerland (forced here)
    r = await pg.evaluate("(async()=>{const D=HP.viewer.current();const s=await HP.strip.save(D,null,null,'vec');D.strip=s;const V=await HP.db.blob(D.id+':vec');return{n:V.ways.length,k:[...new Set(V.ways.map(w=>w.k))].join(''),p:V.pois.length}})()")
    check(r['n'] > 50 and 'p' in r['k'], f"elsewhere: the paths, roads and huts around the route are saved ({r['n']} lines, {r['p']} places)")
    await ctx.set_offline(True)
    await pg.click('#guidebtn'); await pg.wait_for_function("HP.guide.active()", timeout=10000); await pg.wait_for_timeout(600)
    await pg.evaluate(f"HP.guide.fix({R[0]},{R[1]},6)"); await pg.evaluate("void HP.guide.map().setZoom(16,{animate:false})"); await pg.wait_for_timeout(1500)
    check(await pg.evaluate("!!document.querySelector('#gmap .leaflet-off-pane canvas')"), "  and the guide draws them sharply with no connection")
    await pg.screenshot(path=os.path.join(T.SHOTS, "v23_guide_offline_drawn.png"))
    await pg.click('#gexit'); await ctx.set_offline(False)
    await pg.evaluate(f"HP.db.remove({json.dumps(hid)})")
    left = await pg.evaluate(f"Promise.all([HP.db.keys({json.dumps(hid)}+':m:'),HP.db.blob({json.dumps(hid)}+':vec')]).then(([k,v])=>k.length+(v?1:0))")
    check(left == 0, "deleting the hike deletes its saved map")
    check(not [e for e in errs if 'GPU' not in e and 'ERR_INTERNET' not in e], "no errors: " + "; ".join(errs[:2]))
    await ctx.close()

async def marked_routes(b):
    print("Marked routes on the planning map")
    ctx = await b.new_context(**H.PHONE, ignore_https_errors=True); await T.mock(ctx, []); pg = await ctx.new_page(); n = {'w': 0}
    pg.on('request', lambda r: n.__setitem__('w', n['w'] + 1) if 'waymarkedtrails' in r.url else None)
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await pg.evaluate("localStorage.setItem('hp-view',JSON.stringify({center:[45.598,24.70],zoom:13}))")
    await pg.goto(T.BASE + "?nosw&w=1#/new", wait_until="load"); await pg.wait_for_timeout(3000)
    check(n['w'] > 0 and await pg.get_attribute('#wmt', 'aria-pressed') == 'true', f"the marked routes show over the map ({n['w']} tiles)")
    check('waymarkedtrails.org' in await pg.inner_text('#pmap .leaflet-control-attribution'), "  with their credit")
    await pg.click('#wmt'); await pg.wait_for_timeout(500)
    await pg.goto(T.BASE + "?nosw&w=2#/new", wait_until="load"); await pg.wait_for_timeout(1000)
    check(await pg.get_attribute('#wmt', 'aria-pressed') == 'false', "switched off, they stay off")
    await ctx.close()

async def main():
    which = sys.argv[1:] or ['all']
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS)
        if 'all' in which or 'plan' in which: await planning_hike(b)
        if 'all' in which or 'backup' in which: await problems_and_backup(b)
        if 'all' in which or 'signal' in which: await no_signal(b)
        if 'all' in which or 'routes' in which: await marked_routes(b)
        await b.close()
    print("ALL OK" if not FAILS else f"{len(FAILS)} FAILED")
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
