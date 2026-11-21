"""Touch in the 3D view: one finger moves the map, two fingers turn, tilt, twist and pinch. Usage: python3 tests/test_touch.py"""
import asyncio, json, math
from playwright.async_api import async_playwright
import test_app as T, test_home as H
# A flick needs real finger timing, which a software-drawn test browser can't keep up with, so it is played in one go.
FLICK = """async()=>{const c=document.querySelector('#cv'),r=c.getBoundingClientRect(),x0=r.left+r.width/2,y0=r.top+r.height*.55;
  const ev=(t,x,y)=>c.dispatchEvent(new PointerEvent(t,{pointerId:7,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true}));
  const spin=ms=>{const t=performance.now();while(performance.now()-t<ms);};
  ev('pointerdown',x0,y0);for(let k=1;k<=6;k++){spin(16);ev('pointermove',x0+14*k,y0)}spin(8);ev('pointerup',x0+84,y0);
  const t1=V3.ctl.target.clone(),g=V3.gliding();await new Promise(ok=>setTimeout(ok,1500));return{gliding:g,glided:Math.round(V3.ctl.target.distanceTo(t1))}}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS)
        ctx = await b.new_context(**H.PHONE, ignore_https_errors=True); log, errs = [], []; await T.mock(ctx, log); pg = await ctx.new_page(); T.watch(pg, errs)
        await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(2500)
        cdp = await ctx.new_cdp_session(pg)
        async def tch(typ, pts): await cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in pts]})
        async def two(a, bb, fa, fb, n=10, hold=300):
            await tch('touchStart', [(0, a), (1, bb)])
            for k in range(1, n + 1): await tch('touchMove', [(0, fa(a, k)), (1, fb(bb, k))]); await pg.wait_for_timeout(20)
            await pg.wait_for_timeout(hold)
        st = await pg.evaluate("(()=>{const r=document.querySelector('#cv').getBoundingClientRect();return[r.left,r.top,r.width,r.height]})()")
        cx, cy = st[0] + st[2] / 2, st[1] + st[3] * .55
        state = lambda: pg.evaluate("[V3.ctl.target.toArray(),V3.cam.position.distanceTo(V3.ctl.target),V3.ctl.getAzimuthalAngle(),V3.ctl.getPolarAngle()]")
        near = lambda a, b, tol=2: all(abs(x - y) <= tol for x, y in zip(a, b))
        # one finger: the ground under the finger stays under it, and lifting a still finger doesn't glide
        g = await pg.evaluate(f"V3.groundAt({cx},{cy})"); s0 = await state()
        await tch('touchStart', [(0, (cx, cy))])
        for k in range(1, 13): await tch('touchMove', [(0, (cx - 6 * k, cy - 5 * k))]); await pg.wait_for_timeout(20)
        await pg.wait_for_timeout(900); sc = await pg.evaluate(f"V3.toScreen({json.dumps(g)})")
        await tch('touchEnd', []); await pg.wait_for_timeout(50); s1 = await state()
        print('ONE FINGER moves the map:', near(sc, (cx - 72, cy - 60)), '| ground under the finger', [round(v) for v in sc], '| turned or zoomed:', abs(s1[2] - s0[2]) > 1e-3 or abs(s1[1] - s0[1]) > 1, '| glides after a stop:', await pg.evaluate("V3.gliding()"))
        print('FLICK:', await pg.evaluate(FLICK))
        await tch('touchStart', [(0, (cx, st[1] + 20))]); print('  a touch stops the glide:', not await pg.evaluate("V3.gliding()")); await tch('touchEnd', []); await pg.wait_for_timeout(300)
        # two fingers sideways: turn, no move, no zoom; up: tilt toward the horizon; down: from above
        s2 = await state(); await two((cx - 60, cy), (cx + 60, cy), lambda a, k: (a[0] + 10 * k, a[1]), lambda a, k: (a[0] + 10 * k, a[1])); await tch('touchEnd', []); s3 = await state()
        print('TWO SIDEWAYS turns:', round(s3[2] - s2[2], 3), 'rad | moved', round(math.dist(s2[0], s3[0])), 'm | zoomed', round(s3[1] - s2[1]), 'm')
        await two((cx - 60, cy), (cx + 60, cy), lambda a, k: (a[0], a[1] - 6 * k), lambda a, k: (a[0], a[1] - 6 * k)); await tch('touchEnd', []); s4 = await state()
        await two((cx - 60, cy - 60), (cx + 60, cy - 60), lambda a, k: (a[0], a[1] + 12 * k), lambda a, k: (a[0], a[1] + 12 * k)); await tch('touchEnd', []); s5 = await state()
        print('TWO UP tilts:', round(s3[3], 3), '->', round(s4[3], 3), '| TWO DOWN:', round(s5[3], 3))
        # pinch apart: zooms in about the spot between the fingers
        g2 = await pg.evaluate(f"V3.groundAt({cx},{cy})")
        await two((cx - 40, cy), (cx + 40, cy), lambda a, k: (a[0] - 8 * k, a[1]), lambda a, k: (a[0] + 8 * k, a[1]), hold=900)
        sc2 = await pg.evaluate(f"V3.toScreen({json.dumps(g2)})"); await tch('touchEnd', []); await pg.wait_for_timeout(300); s6 = await state()
        print('PINCH zooms in:', round(s5[1]), '->', round(s6[1]), 'm | spot stays between the fingers:', near(sc2, (cx, cy)), [round(v) for v in sc2])
        # twist clockwise, seen from above: the map turns with the fingers (a spot right of the middle moves down)
        g3 = await pg.evaluate(f"V3.groundAt({cx + 60},{cy})"); p3 = await pg.evaluate(f"V3.toScreen({json.dumps(g3)})"); r = 70
        await two((cx - r, cy), (cx + r, cy), lambda a, k: (cx - r * math.cos(math.radians(3 * k)), cy - r * math.sin(math.radians(3 * k))), lambda a, k: (cx + r * math.cos(math.radians(3 * k)), cy + r * math.sin(math.radians(3 * k))), hold=900)
        q3 = await pg.evaluate(f"V3.toScreen({json.dumps(g3)})"); await tch('touchEnd', []); await pg.wait_for_timeout(300); s7 = await state()
        print('TWIST turns with the fingers:', q3[1] > p3[1] + 10, '| turned', round(math.degrees(s7[2] - s6[2])), 'degrees | zoomed', round(s7[1] - s6[1]), 'm')
        await pg.click('#reset'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=T.SHOTS + "t_touch.png")
        print('ERRORS:', [e for e in errs if 'GPU' not in e and 'no longer' not in e and 'setPointerCapture' not in e] or 'none'); await b.close()
asyncio.run(main())
