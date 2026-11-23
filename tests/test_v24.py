"""Version 2.4: getting back. The card and the page for the way back: the Swiss timetable after you arrive and the last connection of
the day, a stand-in date when the timetable isn't out yet, a missed last connection, the road, the stations and bus stops outside
Switzerland, the walk back the same way (its days, times, climbs and closed huts), planning it as its own hike, the plan to leave with
someone, the live guide on the last day, keeping it all for offline use, and no card for a loop.
Usage: BASE=http://localhost:8777/ python3 tests/test_v24.py"""
import asyncio, datetime, json, math, os, re, sys, tempfile
from playwright.async_api import async_playwright
import test_app as T, test_home as H

FAILS = []
def check(cond, what):
    print(("  ok   " if cond else "  FAIL ") + what)
    if not cond: FAILS.append(what)

def ahead(days): return (datetime.date.today() + datetime.timedelta(days=days)).isoformat()
def hours(s): return int(s[:2]) + int(s[3:]) / 60

def gpx_file(pts):
    f = tempfile.NamedTemporaryFile("w", suffix=".gpx", delete=False)
    f.write('<?xml version="1.0"?>\n<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>t</name><trkseg>\n'
            + "".join(f'<trkpt lat="{la:.6f}" lon="{lo:.6f}"></trkpt>\n' for la, lo in pts) + "</trkseg></trk></gpx>\n")
    f.close(); return f.name

def line(wps, step=.15):
    pts = []
    for (a, b), (c, d) in zip(wps, wps[1:]):
        n = max(1, int(math.hypot((c - a) * 111.2, (d - b) * 111.2 * math.cos(math.radians(a))) / step))
        pts += [(a + (c - a) * i / n + .0004 * math.sin(i / n * math.pi * 3), b + (d - b) * i / n) for i in range(n)]
    return pts + [wps[-1]]

async def build_file(pg, path, date):
    await pg.goto(T.BASE + "?nosw#/new", wait_until="load"); await pg.wait_for_timeout(600)
    await pg.click("#tab-file"); await pg.set_input_files("#file", path); await pg.wait_for_timeout(400)
    await pg.fill("#hdate", date); await pg.dispatch_event("#hdate", "input"); return await T.build_and_wait(pg)

async def back_state(pg, key='pick'):
    bk = None
    for _ in range(60):
        bk = await pg.evaluate("HP.viewer.back()")
        if bk and bk.get(key): return bk
        await pg.wait_for_timeout(500)
    return bk

async def swiss(b):
    print("In Switzerland: the timetable back, the road, the walk back")
    ctx = await b.new_context(**H.PHONE, ignore_https_errors=True, permissions=['clipboard-read', 'clipboard-write'], accept_downloads=True); log = []
    await T.mock(ctx, log); pg = await ctx.new_page(); errs = []; T.watch(pg, errs)
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, ahead(10)); await pg.wait_for_timeout(1500)
    hid = await pg.evaluate("HP.viewer.current().id")
    bk = await back_state(pg); pk = bk['pick']; nxt = pk and pk['next']
    arr = await pg.evaluate("(()=>{const V=HP.viewer.state();return V.CLK[V.N-1]})()")
    want = min(h + 14 / 60 for h in range(5, 22) if h + 14 / 60 >= arr + 5 / 60) if arr < 21 else None
    check(nxt and abs(hours(nxt['dep']) - want) < .01 and nxt['legs'][0]['a'] == 'Kandersteg' and nxt['legs'][-1]['b'] == 'Wengen',
          f"the first connection you can catch after arriving at {arr:.2f} h: the {nxt and nxt['dep']} from Kandersteg to Wengen")
    check(pk and pk['last'] and pk['last']['dep'] == '21:14' and not pk['missed'], "  and the last one of the day, 21:14")
    card = await pg.inner_text('#backcard')
    check(nxt and nxt['dep'] in card and '21:14' in card and '1 h 57' in card and 'On foot the same way: 3 days' in card,
          "the card: the next one, the travel time, the changes, the last one and the walk back")
    await pg.evaluate("document.querySelector('#backcard').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(300)
    await pg.screenshot(path=os.path.join(T.SHOTS, "v24_card.png"))
    await pg.click('#backcard .ch'); await pg.wait_for_timeout(900)
    check(await pg.inner_text('#ttl') == 'Getting back', "the card opens its page")
    page = await pg.inner_text('#detail')
    check('Regional train RE 1' in page and 'Rack railway CC 63' in page and 'platform 2' in page and 'walk 3 min' in page, "  each leg: the train, the platform, the stations, the times and the walks between")
    check(page.count('21:14 → 23:11') == 1, "  the last connection is listed once")
    check('No road for cars reaches Wengen' in page, "  the road: none reaches car-free Wengen")
    check('Buy the ticket before you board' in page and 'Open in Google Maps' in page, "  how to buy the ticket, and the trip in Google Maps")
    # on foot, the same way back
    w = bk['walk']; out = await pg.evaluate("(()=>{const V=HP.viewer.state(),R=V.R;let up=0,dn=0;for(const d of V.DAYS)for(let i=d.i0;i<d.i1;i++){const z=R.e[i+1]-R.e[i];if(z>0)up+=z;else dn-=z}const d=V.DAYS[2];return{up,dn,t3:(R.t[d.i1]-R.t[d.i0])*V.S.pace}})()")
    check(len(w) == 3 and w[0]['from'] == 'Kandersteg' and w[0]['to'] == 'Berghaus Bundalp' and w[-1]['to'] == 'Wengen', "on foot: the same three days the other way round, Kandersteg to Wengen")
    check(abs(sum(x['up'] for x in w) - out['dn']) < 1 and abs(sum(x['dn'] for x in w) - out['up']) < 1, "  the descents of the way out are the climbs of the way back")
    check(w[0]['h'] > out['t3'] * 1.05, f"  the first day back, up to the Hohtürli, takes longer than coming down it ({w[0]['h']:.1f} h against {out['t3']:.1f} h)")
    check('usually closed then' in page and 'usually closed on the nights back' in page, "  the huts for the nights back are flagged when they are usually closed (December)")
    check('biggest climb going back' in page and 'Plan the walk back as its own hike' in page, "  the biggest climb going back, and a button to plan the walk back")
    await pg.screenshot(path=os.path.join(T.SHOTS, "v24_page.png"), full_page=True)
    # the plan to leave with someone says how you get back
    t = await pg.evaluate("HP.planText()")
    check(nxt and f"Getting back: the {nxt['dep']} from Kandersteg gets me to Wengen at {nxt['arr']}" in t, "the plan to leave with someone says how you get back")
    # kept with the hike, so it shows offline
    check(await pg.evaluate(f"HP.db.plan({json.dumps(hid)}).then(D=>!!(D&&D.back&&D.back.pt.next.length))"), "the way back is saved with the hike")
    await pg.go_back(); await pg.wait_for_timeout(600); await ctx.set_offline(True)
    await pg.evaluate("location.hash='#/'"); await pg.wait_for_timeout(1200); await pg.evaluate(f"location.hash='#/hike/{hid}'"); await pg.wait_for_timeout(2500)
    check(nxt and nxt['dep'] in await pg.inner_text('#backcard'), "  and shows without a connection, read back from the phone")
    await ctx.set_offline(False)
    # the live guide, on the last day: the train back at the arrival it expects
    await pg.click('#guidebtn'); await pg.wait_for_function("HP.guide.active()", timeout=10000); await pg.wait_for_timeout(600)
    R = await pg.evaluate("(()=>{const V=HP.viewer.state(),i=V.N-40;return [V.R.lat[i],V.R.lon[i]]})()")
    await pg.evaluate(f"HP.guide.fix({R[0]},{R[1]},6)"); await pg.wait_for_timeout(800)
    gl = await pg.inner_text('#gpanel .glines')
    check('Back to Wengen: the' in gl or 'miss the last connection back' in gl, f"the live guide on the last day: the train back ({gl.splitlines()[-2] if len(gl.splitlines()) > 1 else gl})")
    await pg.go_back(); await pg.wait_for_timeout(800)
    # arriving late: the last connection is missed
    await pg.fill("#start", "15:00"); await pg.dispatch_event("#start", "change"); await pg.wait_for_timeout(1200)
    card = await pg.inner_text('#backcard')
    check('after the last connection back (21:14)' in card, "starting at 15:00 you arrive after the last connection: the card says so in red")
    det = await pg.evaluate("HP.viewer.detail('back').html")
    check('plan a night in Kandersteg' in det, "  and the page offers a night at the end")
    await pg.fill("#start", "07:00"); await pg.dispatch_event("#start", "change"); await pg.wait_for_timeout(800)
    # the walk back as its own hike
    await pg.evaluate("document.querySelector('#backcard').scrollIntoView({block:'center'})"); await pg.click('#backcard .ch'); await pg.wait_for_timeout(900)
    await pg.click('#detail [data-dact="walkback"]'); await pg.wait_for_timeout(500)
    check('Plan the walk back' in await pg.inner_text('#dlgmsg'), "Plan the walk back asks first")
    await pg.click('#dlgok')
    await pg.wait_for_function("(()=>{const D=HP.viewer.current();return D&&/· way back$/.test(D.name)&&!document.querySelector('#scr-view').hidden&&document.querySelector('#msg').hidden})()", timeout=240000)
    await pg.wait_for_timeout(1200)
    D2 = await pg.evaluate("(()=>{const D=HP.viewer.current();return{id:D.id,name:D.name,date:D.date,lat:D.route.lat[0],lon:D.route.lon[0],from:D.days[0].from,to:D.days[D.days.length-1].to,n:D.days.length}})()")
    check(D2['name'].endswith('· way back') and D2['from'] == 'Kandersteg' and D2['to'] == 'Wengen' and abs(D2['lat'] - 46.4955) < .01,
          f"  it builds the walk back as its own hike, {D2['from']} to {D2['to']}")
    check(D2['date'] == ahead(13) and D2['id'] != hid, "  from the day after the last day, and the first hike stays")
    check(not [e for e in errs if 'GPU' not in e and 'ERR_INTERNET_DISCONNECTED' not in e], "no errors: " + "; ".join(errs[:2]))
    await ctx.close()

async def later_dates(b):
    print("Timetables not out yet")
    for days, what in ((200, "months away, so not asked for"), (50, "asked for, but still empty")):
        ctx = await b.new_context(**H.PHONE, ignore_https_errors=True); await T.mock(ctx, []); pg = await ctx.new_page(); errs = []; T.watch(pg, errs)
        await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, ahead(days)); await pg.wait_for_timeout(1500)
        bk = await back_state(pg)
        typ, last = await pg.evaluate("(()=>{const D=HP.viewer.current();return[D.back&&D.back.pt.typ,D.days.length]})()")
        page = await pg.evaluate("HP.viewer.detail('back').html")
        same = typ and datetime.date.fromisoformat(typ).weekday() == (datetime.date.today() + datetime.timedelta(days=days + last - 1)).weekday()
        check(bk and bk['pick'] and bk['pick']['next'] and same and 'isn’t published yet' in page,
              f"{days} days ahead ({what}): the same weekday soon ({typ}) stands in, and the page says so")
        check(not [e for e in errs if 'GPU' not in e], "  no errors: " + "; ".join(errs[:2]))
        await ctx.close()

async def abroad(b):
    print("Outside Switzerland: stations, bus stops and the road")
    path = gpx_file(line([(45.6036, 24.6175), (45.5965, 24.6285), (45.5905, 24.6440), (45.5880, 24.6610)]))
    ctx = await b.new_context(**H.PHONE, ignore_https_errors=True); log = []; await T.mock(ctx, log); pg = await ctx.new_page(); errs = []; T.watch(pg, errs)
    try: await build_file(pg, path, ahead(20))
    finally: os.unlink(path)
    for _ in range(60):
        if await pg.evaluate("!!(HP.viewer.current().back)"): break
        await pg.wait_for_timeout(500)
    B = await pg.evaluate("HP.viewer.current().back")
    check(B and B['kind'] == 'osm' and B['pt']['f']['train']['name'].startswith('Gara') and B['pt']['f']['bus'] and B['car'] and B['car']['min'] > 0,
          "the nearest station and bus stop at each end, and the drive back")
    check('transport' not in log, "  without asking the Swiss timetable")
    card = await pg.inner_text('#backcard'); page = await pg.evaluate("HP.viewer.detail('back').html")
    check('BY ROAD' in card.upper() and 'to a station' in card.lower(), "the card: by road, and how far the station is")
    check('Gara' in page and 'Find the trains and buses in Google Maps' in page and 'timetables for Switzerland only' in page, "the page: stations and stops, Google Maps, and why there's no timetable")
    check(not [e for e in errs if 'GPU' not in e], "no errors: " + "; ".join(errs[:2]))
    await ctx.close()

async def loop(b):
    print("A loop")
    out = line([(46.5560, 7.8930), (46.5530, 7.8800), (46.5480, 7.8700)])
    path = gpx_file(out + out[::-1][1:])
    ctx = await b.new_context(**H.PHONE, ignore_https_errors=True); log = []; await T.mock(ctx, log); pg = await ctx.new_page(); errs = []; T.watch(pg, errs)
    try: await build_file(pg, path, ahead(12))
    finally: os.unlink(path)
    await pg.wait_for_timeout(2500)
    check(await pg.evaluate("document.querySelector('#backcard').hidden") and 'transport' not in log, "a hike that ends where it starts has no Getting back card, and asks nothing")
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS)
        await swiss(b); await later_dates(b); await abroad(b); await loop(b)
        await b.close()
    print("ALL OK" if not FAILS else f"{len(FAILS)} FAILED")
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
