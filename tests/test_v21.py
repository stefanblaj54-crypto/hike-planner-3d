"""Version 2.1: the easier way round hard places, and the motion (page transitions, presses, sliding indicators, overlays).
Usage: BASE=http://localhost:8777/ python3 tests/test_v21.py"""
import asyncio, sys
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

async def easier(pg, log):
    await wait_trail(pg)
    orig = await pg.evaluate("location.hash"); name = await pg.inner_text("#ttl")
    await pg.click("#safecard"); await pg.wait_for_function("!document.querySelector('#scr-detail').hidden", timeout=20000); await pg.wait_for_timeout(700)
    btn = pg.locator('#detail [data-dact="easier"]')
    check(await btn.count() == 1, "the safety page offers to find an easier way")
    n0 = log.count("brouter")
    await btn.click()
    await pg.wait_for_function("!document.querySelector('#dialog').hidden", timeout=60000); await pg.wait_for_timeout(500)
    msg = (await pg.inner_text("#dlgmsg")).lower()
    check("an easier way" in msg and "goes round" in msg and "distance" in msg, "the result compares the easier way with this one: " + msg.replace("\n", " / ")[:160])
    check(log.count("brouter") - n0 >= 3, f"it asked the trail router for ways round ({log.count('brouter') - n0} requests)")
    await pg.locator("#dialog .dlgbox").screenshot(path=T.SHOTS + "easier_dialog.png")
    await pg.click("#dlgok")
    await pg.wait_for_function("location.hash!==%r&&!document.querySelector('#scr-view').hidden&&document.querySelector('#msg').hidden" % orig, timeout=240000)
    await pg.wait_for_timeout(1500)
    t = await pg.inner_text("#ttl")
    check(t.endswith("· easier") and name in t, f"the easier way is saved as a new hike: {t}")
    await pg.go_back(); await pg.wait_for_timeout(2500)
    check(await pg.evaluate("location.hash") == orig and await pg.inner_text("#ttl") == name, "Back returns to the original hike, which stays as it was")

async def motion(pg):
    vt = await pg.evaluate("!!document.startViewTransition")
    check(vt, "this browser has view transitions")
    # a card grows into its page: the transition runs as 'expand', the card and the page's surface share a name
    await pg.locator("#zcard").scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
    await pg.evaluate("window._vt=[];new MutationObserver(()=>{const v=document.documentElement.dataset.vt;if(v)window._vt.push(v)}).observe(document.documentElement,{attributes:true,attributeFilter:['data-vt']})")
    await pg.click("#zcard"); await pg.wait_for_function("!document.querySelector('#scr-detail').hidden", timeout=20000); await pg.wait_for_timeout(900)
    check("expand" in await pg.evaluate("window._vt"), "a card grows into its page")
    check(await pg.evaluate("!document.documentElement.dataset.vt&&!document.querySelector('#zcard').style.viewTransitionName"), "afterwards no transition names are left behind")
    await pg.go_back(); await pg.wait_for_function("document.querySelector('#scr-detail').hidden", timeout=20000); await pg.wait_for_timeout(1800)
    check("collapse" in await pg.evaluate("window._vt"), "the page shrinks back into its card")
    # the map style control: one indicator slides to the chosen option
    await pg.click('#mapseg button[data-map="topo"]'); await pg.wait_for_timeout(900)
    r = await pg.evaluate("(()=>{const i=document.querySelector('#mapseg>.segi'),b=document.querySelector('#mapseg button[aria-pressed=true]');if(!i||!b)return null;const m=/translate\\(([-\\d.]+)px/.exec(i.style.transform);return{x:+m[1],bx:b.offsetLeft,w:parseFloat(i.style.width),bw:b.offsetWidth}})()")
    check(r and abs(r["x"] - r["bx"]) < 1 and abs(r["w"] - r["bw"]) < 1, f"the indicator sits under the chosen map style {r}")
    await pg.click('#mapseg button[data-map="sat"]'); await pg.wait_for_timeout(700)
    # the sheet goes out with an animation, then hides
    await pg.click("#more"); await pg.wait_for_timeout(600)
    check(await pg.is_visible("#sheet"), "the hike's menu opens")
    await pg.mouse.click(195, 90); await pg.wait_for_timeout(60)
    mid = await pg.evaluate("document.querySelector('#sheet').classList.contains('out')&&!document.querySelector('#sheet').hidden")
    await pg.wait_for_timeout(700)
    check(mid and await pg.is_hidden("#sheet"), "the menu slides away before it hides")
    # going back to the list slides back
    await pg.click("#back"); await pg.wait_for_function("document.body.dataset.screen==='home'", timeout=30000); await pg.wait_for_timeout(1200)
    check("pop" in await pg.evaluate("window._vt"), "going back slides the page away to the right")
    await pg.screenshot(path=T.SHOTS + "v21_home.png")
    # a press (on the home screen, where no 3D view slows the test browser): the button shrinks at once and springs back
    b = pg.locator("#hero .btn.primary"); await b.scroll_into_view_if_needed(); await pg.wait_for_timeout(300); box = await b.bounding_box()
    await pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); await pg.mouse.down(); await pg.wait_for_timeout(180)
    s1 = await pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#hero .btn.primary')).scale)||1")
    await pg.mouse.move(box["x"] - 40, box["y"] - 60); await pg.mouse.up(); await pg.wait_for_timeout(800)
    s2 = await pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#hero .btn.primary')).scale)||1")
    check(s1 < .99 and abs(s2 - 1) < .002, f"a pressed button shrinks ({s1:.3f}) and springs back ({s2:.3f})")

async def reduced(b, log, errs):
    ctx = await b.new_context(**H.PHONE, ignore_https_errors=True, reduced_motion="reduce"); await T.mock(ctx, log); pg = await ctx.new_page(); T.watch(pg, errs)
    await pg.goto(T.BASE + "?nosw#/about", wait_until="load"); await pg.wait_for_timeout(800)
    await pg.evaluate("window._vt=[];new MutationObserver(()=>{const v=document.documentElement.dataset.vt;if(v)window._vt.push(v)}).observe(document.documentElement,{attributes:true,attributeFilter:['data-vt']})")
    await pg.click("#back"); await pg.wait_for_timeout(600)
    await pg.click("#menubtn"); await pg.wait_for_timeout(300); await pg.click('[data-go="customize"]'); await pg.wait_for_timeout(600)
    check(await pg.evaluate("window._vt.length") == 0 and await pg.evaluate("document.body.dataset.screen") == "custom", "with reduced motion the screens change at once")
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS)
        log, errs = [], []
        ctx = await b.new_context(**H.PHONE, ignore_https_errors=True); await T.mock(ctx, log); pg = await ctx.new_page(); T.watch(pg, errs)
        await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(1500)
        await motion(pg)
        await pg.evaluate("document.querySelector('#hikes .hike').click()"); await pg.wait_for_function("document.body.dataset.screen==='view'&&document.querySelector('#msg').hidden", timeout=60000); await pg.wait_for_timeout(1000)
        await easier(pg, log)
        await ctx.close()
        await reduced(b, log, errs)
        bad = [e for e in errs if "GPU stall" not in e and "no longer repeat" not in e]
        check(not bad, "no errors on the page" + ("" if not bad else ": " + " | ".join(bad[:5])))
        await b.close()
    print(f"\n{len(FAILS)} FAILED" if FAILS else "\nALL PASSED")
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
