"""Home screen, menu and Customize: screenshots across themes, backgrounds, times of day and screen sizes."""
import asyncio, datetime, json, sys
from playwright.async_api import async_playwright
import test_app as T
S=T.SHOTS
PHONE=dict(viewport={"width":390,"height":844},device_scale_factor=2,is_mobile=True,has_touch=True)
async def setlook(pg,look,hour=None,path="#/"):
    look=dict({"lv":3},**look)   # a look from this version, so the theme asked for is not moved to Carbon
    await pg.evaluate(f"localStorage.setItem('hp-look',JSON.stringify({json.dumps(look)}))")
    global N; N=globals().get("N",0)+1
    q=(("&hour="+str(hour)) if hour is not None else "")+f"&n={N}"
    await pg.goto(T.BASE+"?nosw"+q+path,wait_until="load"); await pg.wait_for_timeout(1200)
async def build(pg,date,name=None,reverse=False):
    await pg.goto(T.BASE+"?nosw#/new",wait_until="load"); await pg.wait_for_timeout(600)
    await pg.click("#tab-file"); await pg.set_input_files("#file",T.GPX); await pg.wait_for_timeout(500)
    if reverse: await pg.click("#reverse")
    if name: await pg.fill("#hname",name)
    await pg.fill("#hdate",date); await pg.dispatch_event("#hdate","input"); await pg.select_option("#hdays","3")
    ok=await T.build_and_wait(pg); await pg.wait_for_timeout(800)
    # the 3D view saves a picture of the hike for the home screen once its satellite picture and heights are in
    hid=await pg.evaluate("decodeURIComponent(location.hash.split('/')[2]||'')")
    for _ in range(40):
        if await pg.evaluate(f"HP.db.meta({json.dumps(hid)}).then(m=>!!(m&&m.cover))"): break
        await pg.wait_for_timeout(750)
    else: print("NO COVER for", hid)
    return ok
async def main(which):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=T.CHROME,headless=True,args=T.ARGS)
        ctx=await b.new_context(**PHONE,ignore_https_errors=True)
        log,errs=[],[]; await T.mock(ctx,log); pg=await ctx.new_page(); T.watch(pg,errs)
        await pg.goto(T.BASE+"?nosw#/",wait_until="load"); await pg.wait_for_timeout(600)
        if which in ("empty","all"):
            for h in (7,13,19,23):
                await setlook(pg,{},hour=h); await pg.screenshot(path=S+f"h_empty_{h}.png")
        if which in ("full","all"):
            d1=(datetime.date.today()+datetime.timedelta(days=2)).isoformat()
            await build(pg,d1); await build(pg,"2026-09-12",name="Bärentrek, the other way",reverse=True)
            await setlook(pg,{},hour=16); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=S+"h_full_16.png")
            await pg.screenshot(path=S+"h_full_16_page.png",full_page=True)
            print("HERO:",(await pg.inner_text("#hero")).replace("\n"," | ")[:400])
            print("HERO BG:",await pg.evaluate("document.querySelector('#hero').dataset.bg"),"| pictures loaded:",await pg.evaluate("[...document.querySelectorAll('#hero img.cov,.hike img.th.cov')].map(i=>i.complete&&i.naturalWidth).join(',')"))
            print("LIST:",(await pg.inner_text("#listwrap")).replace("\n"," | ")[:400])
            await pg.evaluate("window.scrollTo(0,520)"); await pg.wait_for_timeout(400); await pg.screenshot(path=S+"h_full_scrolled.png")
            await pg.evaluate("window.scrollTo(0,0)"); await pg.tap("#menubtn"); await pg.wait_for_timeout(500); await pg.screenshot(path=S+"h_drawer.png")
            await pg.tap("[data-go='customize']"); await pg.wait_for_timeout(1200); await pg.screenshot(path=S+"c_top.png")
            await pg.evaluate("window.scrollTo(0,700)"); await pg.wait_for_timeout(300); await pg.screenshot(path=S+"c_mid.png")
            await pg.evaluate("window.scrollTo(0,1500)"); await pg.wait_for_timeout(300); await pg.screenshot(path=S+"c_low.png")
            await pg.evaluate("window.scrollTo(0,99999)"); await pg.wait_for_timeout(300); await pg.screenshot(path=S+"c_end.png")
            # click through some settings in Customize
            await pg.evaluate("window.scrollTo(0,0)")
            await pg.click("[data-k='theme'][data-v='titanium']"); await pg.wait_for_timeout(500); await pg.screenshot(path=S+"c_titanium.png")
            await pg.set_input_files("#photoin",T.PHOTO); await pg.wait_for_timeout(1500)
            print("BG after photo:",await pg.evaluate("JSON.parse(localStorage.getItem('hp-look')).bg"))
            await pg.screenshot(path=S+"c_photo.png")
            looks=[("spruce_dark",{"mode":"dark"},21),("titanium",{"theme":"titanium"},12),("signpost",{"theme":"signpost","tod":False},12),("glacier_contours",{"theme":"glacier","bg":"contours"},12),
                   ("larch_map",{"theme":"larch","bg":"map","dim":20},12),("alpenglow",{"theme":"alpenglow"},19),("fjord_cards",{"theme":"fjord","list":"cards"},8),("limestone",{"theme":"limestone","tod":False},12),
                   ("photo",{"bg":"photo","dim":30,"name":"Ștefan"},12),("plain_large",{"bg":"plain","text":"l","corners":"sharp"},12)]
            for nm,lk,h in looks:
                await setlook(pg,lk,hour=h); await pg.wait_for_timeout(600); await pg.screenshot(path=S+f"t_{nm}.png")
            # desktop
            await pg.set_viewport_size({"width":1280,"height":860})
            await setlook(pg,{},hour=17); await pg.wait_for_timeout(1200); await pg.screenshot(path=S+"h_desktop.png")
            await setlook(pg,{"theme":"titanium","mode":"dark"},hour=10,path="#/customize"); await pg.wait_for_timeout(1000); await pg.screenshot(path=S+"c_desktop.png")
            # the viewer still opens and uses the route colours
            await setlook(pg,{"route":"earth"},hour=12); await pg.click(".hike"); await pg.wait_for_function("document.querySelector('#msg').hidden",timeout=60000); await pg.wait_for_timeout(2000)
            await pg.screenshot(path=S+"v_earth.png")
        print("REQUESTS:",log)
        print("ERRORS:","\n".join(e for e in errs if "GPU stall" not in e and "no longer repeat" not in e) or "none")
        await b.close()
if __name__=="__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv)>1 else "all"))
