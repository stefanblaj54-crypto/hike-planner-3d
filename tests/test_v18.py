"""1.8: the wind from real data shaped by the terrain, the best views and the first-person walk,
the pages behind the cards and the dials, and the inventory the packing advice names.
Run from the repository root with the site served (see CLAUDE.md); exits with 1 when a check fails."""
import asyncio, datetime, math, sys
from playwright.async_api import async_playwright
import test_app as T, test_home as H
S = T.SHOTS
FAILS = []
def check(cond, what):
    print(("ok    " if cond else "FAIL  ") + what)
    if not cond: FAILS.append(what)
def cmean(dirs):
    x = sum(math.sin(math.radians(d)) for d in dirs); y = sum(math.cos(math.radians(d)) for d in dirs)
    return (math.degrees(math.atan2(x, y)) + 360) % 360
def adiff(a, b):
    d = abs(a - b) % 360; return min(d, 360 - d)
TITLES = {'brief': 'Alerts and kit', 'wx': 'Weather chance', 'wind': 'Wind', 'views': 'Best views',
          'profile': 'Profile', 'daylight': 'Daylight', 'steep': 'Steepness', 'days': 'Days'}

async def inventory(pg):
    await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await pg.wait_for_timeout(600)
    await pg.click("#menubtn"); await pg.wait_for_timeout(300); await pg.click("[data-go='inventory']"); await pg.wait_for_timeout(400)
    check(await pg.is_visible("#scr-inv") and await pg.inner_text("#ttl") == "Inventory", "the menu opens the inventory")
    await pg.screenshot(path=S + "v18_inv_empty.png")
    for k, name, g in [('shell', "Arc'teryx Beta AR", 395), ('base', 'Icebreaker 200 Oasis', 160), ('fleece', 'Patagonia R1', 330),
                       ('poles', 'Black Diamond Trail', 480), ('headlamp', 'Petzl Actik Core', 75), ('boots', 'La Sportiva TX4 Mid GTX', 1150), ('other', 'Whistle', 8)]:
        await pg.click(f".iadd[data-k='{k}']"); await pg.fill("#iedname", name); await pg.fill("#iedg", str(g)); await pg.click("#iedok"); await pg.wait_for_timeout(120)
    await pg.click(".iadd[data-k='shell']"); await pg.fill("#iedname", "Rab Kinetic 2.0"); await pg.click("#iedok"); await pg.wait_for_timeout(120)
    inv = await pg.evaluate("HP.inv.load()")
    check([x['name'] for x in inv['items']['shell']] == ["Arc'teryx Beta AR", "Rab Kinetic 2.0"], "a kind keeps several items, the first one first")
    check(inv['items']['boots'][0].get('g') == 1150, "the weight is kept")
    await pg.click(".ichip[data-k='shell'][data-n='1']"); await pg.click("#iedfirst"); await pg.wait_for_timeout(150)
    check((await pg.evaluate("HP.inv.load()"))['items']['shell'][0]['name'] == "Rab Kinetic 2.0", "'Use first' moves an item to the front")
    await pg.click(".ichip[data-k='shell'][data-n='0']"); await pg.click("#ieddel"); await pg.wait_for_timeout(150)
    check([x['name'] for x in (await pg.evaluate("HP.inv.load()"))['items']['shell']] == ["Arc'teryx Beta AR"], "'Delete' removes it")
    kp = await pg.inner_text("#inv .kpis")
    check("7" in kp and "2.6" in kp, f"the figures count the items and their weight ({kp.replace(chr(10), ' ')})")
    over = await pg.evaluate("[...document.querySelectorAll('.ichip')].some(c=>c.getBoundingClientRect().right>c.closest('.irow').getBoundingClientRect().right+1)")
    check(not over, "long names stay inside their row")
    await pg.screenshot(path=S + "v18_inv.png", full_page=True)

async def details(pg, tag):
    for k, title in TITLES.items():
        sel = f".card[data-det='{k}']"
        if not await pg.evaluate(f"!!document.querySelector(\"{sel}\")&&!document.querySelector(\"{sel}\").hidden"):
            check(False, f"{tag}: the {k} card is there"); continue
        await pg.evaluate(f"document.querySelector(\"{sel}\").scrollIntoView({{block:'center'}})"); await pg.wait_for_timeout(150)
        await pg.click(f"{sel} .ch"); await pg.wait_for_timeout(400)
        shown = await pg.evaluate("!document.querySelector('#scr-detail').hidden&&document.querySelector('#scr-view').hidden")
        check(shown and await pg.inner_text("#ttl") == title, f"{tag}: the {k} card opens its page '{title}'")
        wide = await pg.evaluate("document.documentElement.scrollWidth>innerWidth+1")
        check(not wide, f"{tag}: the {k} page fits the screen's width")
        await pg.screenshot(path=S + f"v18_{tag}_d_{k}.png", full_page=True)
        await pg.go_back(); await pg.wait_for_timeout(400)
        check(await pg.evaluate("document.querySelector('#scr-detail').hidden&&!document.querySelector('#scr-view').hidden"), f"{tag}: Back closes the {k} page")

async def wind(pg):
    on = await pg.evaluate("[...document.querySelectorAll('#wchips .wchip')].filter(b=>b.getAttribute('aria-disabled')!=='true').map(b=>b.dataset.wx)")
    other = next((k for k in ('storm', 'front', 'wind') if k in on), None)
    check('fair' in on and other is not None, f"two weather types to compare ({', '.join(on)})")
    async def dirs(wx):
        await pg.click(f"[data-wx='{wx}']"); await pg.wait_for_timeout(500)
        return await pg.evaluate("(()=>{const o=[];for(let i=0;i<2200;i+=100)o.push(V3.wind(i));return o})()")
    fair, storm = await dirs('fair'), await dirs(other or 'fair')
    check(all(w['v'] >= 0 and 0 <= w['dir'] < 360 and w['g'] >= w['v'] for w in fair + storm), "wind speeds, gusts and directions are sane")
    mf, ms = cmean([w['dir'] for w in fair]), cmean([w['dir'] for w in storm])
    check(adiff(mf, ms) > 45, f"each weather type has its own wind direction from the records (fair {mf:.0f}°, {other} {ms:.0f}°)")
    g = await pg.evaluate("V3.windGrid(28,1,13)")
    sp = [math.hypot(c[2], c[3]) for c in g['o']]; ds = [(math.degrees(math.atan2(-c[2], -c[3])) + 360) % 360 for c in g['o'] if math.hypot(c[2], c[3]) > .5]
    m = cmean(ds); spread = sorted(adiff(d, m) for d in ds)
    check(max(sp) / max(.1, sorted(sp)[len(sp) // 10]) > 1.6, f"the terrain speeds the wind up and shelters it ({min(sp):.1f} to {max(sp):.1f})")
    check(spread[int(len(spread) * .8)] > 12, f"the terrain turns the wind (80% within {spread[int(len(spread) * .8)]:.0f}° of the mean)")
    await pg.click("[data-wx='fair']"); await pg.wait_for_timeout(400)
    wc = await pg.inner_text("#windcard")
    check("WIND FROM" in wc.upper() and "GUST" in wc.upper(), "the wind card shows gusts and where the wind comes from")

async def views_and_walk(pg, tag):
    await pg.click("[data-wx='fair']"); await pg.wait_for_timeout(400)
    V = await pg.evaluate("HP.viewer.current().views.list")
    check(2 <= len(V) <= 6, f"{tag}: {len(V)} best views found")
    check(all(V[k]['i'] < V[k + 1]['i'] for k in range(len(V) - 1)), f"{tag}: the views are in the order of the route")
    check(all(0 <= v['az'] < 360 and isinstance(v['peaks'], list) for v in V), f"{tag}: each view looks a way and names what is in sight")
    card = await pg.inner_text("#viewscard")
    check(await pg.locator("#viewscard [data-look]").count() == len(V) and "first person" in card, f"{tag}: the card has a look button per view and the walk")
    # first person from the button under the map
    exb = await pg.evaluate("document.querySelector('[data-ex][aria-pressed=\"true\"]').dataset.ex")
    await pg.evaluate("document.querySelector('#fpbtn').scrollIntoView({block:'center'})"); await pg.click("#fpbtn")
    await pg.wait_for_function("V3.fp()", timeout=10000)
    f = await pg.evaluate("V3.fp()")
    check(f['ex'] == 1 and not await pg.evaluate("V3.ctl.enabled") and await pg.is_visible("#fpbar"), f"{tag}: first person walks at true height with its own controls")
    check(await pg.get_attribute("#fpbtn", "aria-pressed") == "true", f"{tag}: the button shows first person is on")
    top = await pg.evaluate("Math.round(document.querySelector('#stage').getBoundingClientRect().top)")
    check(0 <= top <= 200, f"{tag}: the 3D view is in sight ({top} px from the top)")
    k0 = f['km']; await pg.wait_for_function(f"V3.fp()&&(V3.fp().km>{k0}+.004||V3.fp().pause)", timeout=30000)
    check(True, f"{tag}: the walker moves along the route")
    await pg.wait_for_timeout(2500); await pg.evaluate("window.scrollTo({top:document.querySelector('#stage').getBoundingClientRect().top+scrollY-58,behavior:'instant'})"); await pg.wait_for_timeout(300)
    await pg.screenshot(path=S + f"v18_{tag}_fp_walk.png", clip=await pg.evaluate("(()=>{const r=document.querySelector('#stage').getBoundingClientRect();return {x:r.left,y:r.top+scrollY,width:r.width,height:r.height}})()"))
    await pg.click("#fpplay"); await pg.wait_for_timeout(300); a = (await pg.evaluate("V3.fp()"))['km']; await pg.wait_for_timeout(1200); b = (await pg.evaluate("V3.fp()"))['km']
    check(abs(a - b) < 1e-3, f"{tag}: pause stops the walk")
    await pg.click("#fpspeed"); check(await pg.inner_text("#fpspeed") == "4×", f"{tag}: the speed button switches to 4×")
    await pg.evaluate("V3.look(1)"); await pg.wait_for_timeout(600)
    f = await pg.evaluate("V3.fp()"); name = await pg.evaluate("document.querySelectorAll('#viewscard .vlist b')[1].firstChild.textContent")
    check(f['pause'] == 'hold' and name.strip() in f['cap'], f"{tag}: a look stops at the view and names it ({f['cap']})")
    await pg.wait_for_timeout(5000)
    await pg.screenshot(path=S + f"v18_{tag}_fp_view.png", clip=await pg.evaluate("(()=>{const r=document.querySelector('#stage').getBoundingClientRect();return {x:r.left,y:r.top+scrollY,width:r.width,height:r.height}})()"))
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)
    check(await pg.evaluate("V3.fp()") is None and await pg.evaluate("V3.ctl.enabled") and "fp" not in await pg.get_attribute("#stage", "class"), f"{tag}: Escape leaves first person")
    check(await pg.evaluate("document.querySelector('[data-ex][aria-pressed=\"true\"]').dataset.ex") == exb, f"{tag}: the height you had comes back")
    # the walk and the flyover don't run together
    await pg.click("#fpbtn"); await pg.wait_for_function("V3.fp()", timeout=10000); await pg.click("#play"); await pg.wait_for_timeout(300)
    check(await pg.evaluate("V3.fp()") is None and await pg.evaluate("V3.playing()"), f"{tag}: the flyover ends first person")
    await pg.click("#play")
    # 'Look from here' on the views page goes back to the map, at that view
    await pg.evaluate("document.querySelector('#viewscard').scrollIntoView({block:'start'})"); await pg.click("#viewscard .ch"); await pg.wait_for_timeout(500)
    await pg.click("#detail [data-dact='look:0']"); await pg.wait_for_function("V3.fp()", timeout=10000); await pg.wait_for_timeout(400)
    f = await pg.evaluate("V3.fp()"); top = await pg.evaluate("Math.round(document.querySelector('#stage').getBoundingClientRect().top)")
    check(f['pause'] == 'hold' and await pg.evaluate("document.querySelector('#scr-detail').hidden") and 0 <= top <= 200, f"{tag}: 'Look from here' opens first person at that view, in sight ({top} px)")
    await pg.click("#fpexit"); await pg.wait_for_timeout(300)

async def brief_names_items(pg, empty):
    own = await pg.locator("#brief .own").count()
    kit = (await pg.inner_text("#brief")).replace("\n", " ")
    if empty: check(own == 0, "with an empty inventory the advice uses general words")
    else: check(own > 0 and "Arc'teryx Beta AR" in kit, "the advice names the items in the inventory")
    if not empty:
        await pg.evaluate("document.querySelector('.card[data-det=\"brief\"]').scrollIntoView({block:'center'})"); await pg.click(".card[data-det='brief'] .ch"); await pg.wait_for_timeout(400)
        await pg.click("#detail [data-pack='shell']"); await pg.wait_for_timeout(200)
        check(await pg.evaluate("!!(HP.viewer.current().packed||{}).shell"), "ticking an item on the packing list is kept with the hike")
        names = await pg.inner_text("#detail .pack")
        check("Arc'teryx Beta AR" in names and "395 g" in names, "the packing list names your item and its weight")
        await pg.go_back(); await pg.wait_for_timeout(400)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS)
        log, errs = [], []
        near = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
        # phone: a hike before and after filling the inventory, every page, the wind, the views and the walk
        ctx = await b.new_context(**H.PHONE, ignore_https_errors=True); await T.mock(ctx, log); pg = await ctx.new_page(); T.watch(pg, errs)
        await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, near); await pg.wait_for_timeout(1500)
        await brief_names_items(pg, True)
        hid = await pg.evaluate("location.hash")
        await inventory(pg)
        await pg.goto(T.BASE + "?nosw" + hid, wait_until="load"); await pg.wait_for_function("document.querySelector('#msg').hidden", timeout=60000); await pg.wait_for_timeout(1500)
        await brief_names_items(pg, False)
        await details(pg, "phone")
        await wind(pg)
        await views_and_walk(pg, "phone")
        # a dial on the home screen opens its page
        await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await pg.wait_for_timeout(1200)
        ring = pg.locator("#hero .ring[data-det]").first
        if await ring.count():
            det = await ring.get_attribute("data-det"); await ring.click()
            await pg.wait_for_function("!document.querySelector('#scr-detail').hidden", timeout=60000)
            check(await pg.inner_text("#ttl") == TITLES.get(det, '?'), f"the {det} dial on the home screen opens its page")
        else: check(False, "the home screen has dials that open pages")
        await ctx.close()
        # desktop: the pages and the walk on a wide screen
        ctx = await b.new_context(viewport={"width": 1280, "height": 900}, ignore_https_errors=True); await T.mock(ctx, log); pg = await ctx.new_page(); T.watch(pg, errs)
        await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(1500)
        await details(pg, "desktop")
        await views_and_walk(pg, "desktop")
        await ctx.close()
        bad = [e for e in errs if "GPU stall" not in e and "no longer repeat" not in e]
        check(not bad, "no errors on the page" + ("" if not bad else ": " + " | ".join(bad[:5])))
        await b.close()
    print(f"\n{len(FAILS)} FAILED" if FAILS else "\nALL PASSED")
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
