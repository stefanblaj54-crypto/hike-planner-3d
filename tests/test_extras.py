"""A hike saved before version 1.4 (no satellite picture, no detailed heights) gets both the first time it opens online.
Usage: BASE=http://localhost:8777/ python3 tests/test_extras.py"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
import test_app as T, test_home as H

DB = """(op)=>new Promise((ok,no)=>{const r=indexedDB.open('hike-planner-3d',1);r.onsuccess=()=>{const d=r.result;
  const id=decodeURIComponent(location.hash.split('/').pop());
  if(op==='strip'){const t=d.transaction(['plans','blobs','hikes'],'readwrite');const ps=t.objectStore('plans');
    const g=ps.get(id);g.onsuccess=()=>{const D=g.result;delete D.dem;D.v=1;D.set.map='topo';ps.put(D,id)};
    t.objectStore('blobs').delete(id+':sat');t.objectStore('blobs').delete(id+':dem');
    const hs=t.objectStore('hikes'),m=hs.get(id);m.onsuccess=()=>{const x=m.result;x.thumb='data:,old';hs.put(x)};
    t.oncomplete=()=>ok(id);t.onerror=()=>no(t.error)}
  else{const t=d.transaction(['plans','blobs','hikes'],'readonly'),out={id};
    t.objectStore('plans').get(id).onsuccess=e=>{const D=e.target.result;out.dem=D.dem||null;out.map=D.set.map};
    t.objectStore('blobs').get(id+':sat').onsuccess=e=>{out.sat=e.target.result?e.target.result.size:0};
    t.objectStore('blobs').get(id+':dem').onsuccess=e=>{out.demBytes=e.target.result?e.target.result.size:0};
    t.objectStore('hikes').get(id).onsuccess=e=>{out.thumbNew=!!e.target.result&&e.target.result.thumb!=='data:,old'};
    t.oncomplete=()=>ok(out)}};r.onerror=()=>no(r.error)})"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, ignore_https_errors=True)
        log, errs = [], []; await T.mock(ctx, log); pg = await ctx.new_page(); T.watch(pg, errs)
        await H.build(pg, "2027-07-15"); await pg.wait_for_timeout(2500)
        print('NEW HIKE:', await pg.evaluate(DB, 'read'), '| detail texture', await pg.evaluate("V3.det()"))
        print('MAP BUTTONS:', await pg.inner_text('#mapseg'), '| credit shown:', await pg.evaluate("!document.querySelector('#attrib').hidden"))
        hid = await pg.evaluate(DB, 'strip')
        await pg.goto(T.BASE + "?nosw#/", wait_until="load"); await pg.wait_for_timeout(800)
        await pg.goto(T.BASE + "?nosw#/hike/" + hid, wait_until="load")
        await pg.wait_for_selector('#xpill:not([hidden])', timeout=15000)
        print('NOTE WHILE FETCHING:', await pg.inner_text('#xpill'))
        print('MAP WHILE FETCHING:', await pg.evaluate("document.querySelector('[data-map][aria-pressed=true]').dataset.map"), '| detail texture', await pg.evaluate("V3.det()"))
        await pg.wait_for_selector('#xpill', state='hidden', timeout=120000)
        # the list picture is made after the note hides; the software GPU of the test machine keeps the page busy, so allow it time
        for _ in range(40):
            st = await pg.evaluate(DB, 'read')
            if st['thumbNew']: break
            await pg.wait_for_timeout(500)
        print('AFTER:', st)
        print('MAP AFTER:', await pg.evaluate("document.querySelector('[data-map][aria-pressed=true]').dataset.map"), '| buttons:', await pg.inner_text('#mapseg'), '| detail texture', await pg.evaluate("V3.det()"))
        await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(1500)
        await pg.locator('#stage').screenshot(path=T.SHOTS + 'x_upgraded.png')
        print('ERRORS:', [e for e in errs if 'GPU' not in e and 'no longer' not in e] or 'none')
        await b.close()

if __name__ == '__main__':
    asyncio.run(main())
