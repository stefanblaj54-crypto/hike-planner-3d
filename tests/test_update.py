"""Updates reach an installed copy without a new version number in sw.js.
Serves its own copy of the site on port 8791: python3 tests/test_update.py
A (only with OLD=<folder or .zip of an older version>): a phone on the old version switches to this one by itself.
B: a changed file on the website shows on the next check, with no reload loop.
C: away from the hikes list the update waits, then opens on the way back.
D: after updating, the app still opens with no connection."""
import asyncio, os, re, shutil, subprocess, sys, tempfile, time, zipfile
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from playwright.async_api import async_playwright
import test_app as T

ROOT = os.path.join(tempfile.gettempdir(), 'hp-updtest'); SITE = ROOT + '/site'; PORT = 8791; BASE = f'http://localhost:{PORT}/'
NEW = os.path.dirname(HERE)  # the repository root is the app
SKIP = shutil.ignore_patterns('.git', 'tests', '*.md', '.nojekyll', '.gitignore')

def appver(folder):
    return re.search(r"const VERSION='([^']+)'", open(os.path.join(folder, 'js/app.js')).read()).group(1)

def publish(src):  # overwrite the website's files in place, like a deploy (which also gives every file a new date)
    shutil.copytree(src, SITE, dirs_exist_ok=True, copy_function=shutil.copy, ignore=SKIP)
    t = time.time() + 2
    for d, _, fs in os.walk(SITE):
        for f in fs: os.utime(os.path.join(d, f), (t, t))

def edit(path, a, b):
    p = SITE + '/' + path; s = open(p).read(); assert a in s, (path, a); open(p, 'w').write(s.replace(a, b))
    t = time.time() + 2; os.utime(p, (t, t))  # a clearly newer file date, as a real deploy gives

async def ver(pg, want, secs=40):
    for _ in range(secs * 4):
        try:
            v = await pg.evaluate("""(async()=>{if(window.HP&&HP.update&&HP.update.version)return HP.update.version;
              const f=document.querySelector('#dfoot');if(!f)return null;   // v1.2 shows its version only in the menu
              if(!/Version/.test(f.textContent)){document.querySelector('#menubtn').click();await new Promise(r=>setTimeout(r,400));document.querySelector('#drawer [data-go=home]')&&document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))}
              const m=f.textContent.match(/Version ([^ ]+)[.]$/);return m?m[1]:null})()""")
            if v == want: return v
        except Exception: pass
        await asyncio.sleep(.25)
    raise AssertionError(f'version never became {want}, last {v}')

async def main():
    shutil.rmtree(ROOT, ignore_errors=True); os.makedirs(SITE)
    old = os.environ.get('OLD')
    if old and old.endswith('.zip'):
        zipfile.ZipFile(old).extractall(ROOT + '/old'); old = ROOT + '/old'
    cur = appver(NEW)
    publish(old or NEW)
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=SITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS)
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            log, errs = [], []; await T.mock(ctx, log); pg = await ctx.new_page(); T.watch(pg, errs)

            await pg.goto(BASE + '#/', wait_until='load')
            await pg.wait_for_function("navigator.serviceWorker.controller!==null", timeout=30000)
            if old:  # A: the older version installed on the phone, then the website moves to this one
                print('A start:', await ver(pg, appver(old)))
                publish(NEW)
                await pg.reload(wait_until='load')
                print('A after one reopen:', await ver(pg, cur), '| caches:', await pg.evaluate("caches.keys()"))
            else:
                print('start:', await ver(pg, cur))

            # B: a change on the website, no version bump in the service worker
            await pg.wait_for_timeout(2500)
            # the app never reloads by itself twice within 30 s; A may have just done so, so start B with a clean slate
            await pg.evaluate("window.__mark=1;sessionStorage.removeItem('hp-upd')")
            edit('js/app.js', f"const VERSION='{cur}';", f"const VERSION='{cur}-live1';")
            t0 = time.time(); await pg.evaluate("HP.update.check()")
            print('B update shown:', await ver(pg, cur + '-live1'), f'after {time.time()-t0:.1f}s | reloaded:', await pg.evaluate("window.__mark===undefined"))
            await pg.evaluate("window.__mark=2"); await pg.evaluate("HP.update.check()"); await pg.wait_for_timeout(5000)
            print('B no further reload:', await pg.evaluate("window.__mark===2"))

            # C: on the New hike screen the update waits
            await pg.evaluate("location.hash='#/new'"); await pg.wait_for_timeout(1500)
            edit('js/app.js', f"const VERSION='{cur}-live1';", f"const VERSION='{cur}-live2';")
            await pg.evaluate("HP.update.check()"); await pg.wait_for_timeout(4000)
            print('C stayed on screen:', await pg.evaluate("window.__mark===2&&document.body.dataset.screen"),
                  '| pending:', await pg.evaluate("HP.update.pending()"), '| toast:', (await pg.inner_text('#toast')).strip()[:90])
            await pg.click('#back')
            print('C opened on the way back:', await ver(pg, cur + '-live2'), '| screen:', await pg.evaluate("document.body.dataset.screen"))

            # D: no connection
            await ctx.set_offline(True); t0 = time.time()
            await pg.reload(wait_until='load')
            v = await ver(pg, cur + '-live2'); dt = time.time() - t0
            try: await pg.wait_for_function("!!document.querySelector('#hero .hero-sky,#hero svg')", timeout=5000); hero = True
            except Exception: hero = False
            print('D offline open:', v, f'in {dt:.1f}s | hero:', hero, '| picture:', await pg.evaluate("(i=>i?i.complete&&i.naturalWidth:'none')(document.querySelector('#hero img.cov'))"))
            await ctx.set_offline(False)
            bad = [e for e in errs if 'GPU' not in e and 'no longer' not in e and 'ERR_INTERNET_DISCONNECTED' not in e and 'Failed to fetch' not in e]
            print('ERRORS:', bad or 'none')
            await b.close()
    finally:
        srv.terminate()

if __name__=='__main__':asyncio.run(main())
