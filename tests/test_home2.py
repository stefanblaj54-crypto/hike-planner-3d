import asyncio, datetime, json
from playwright.async_api import async_playwright
import test_app as T, test_home as H
S=T.SHOTS
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=T.CHROME,headless=True,args=T.ARGS)
        ctx=await b.new_context(viewport={"width":1280,"height":860},ignore_https_errors=True)
        log,errs=[],[]; await T.mock(ctx,log); pg=await ctx.new_page(); T.watch(pg,errs)
        await pg.goto(T.BASE+"?nosw#/",wait_until="load"); await pg.wait_for_timeout(500)
        await H.build(pg,(datetime.date.today()+datetime.timedelta(days=2)).isoformat())
        await H.setlook(pg,{},hour=17); await pg.wait_for_timeout(1200); await pg.screenshot(path=S+"h2_desktop.png")
        await H.setlook(pg,{"theme":"titanium","mode":"dark"},hour=10,path="#/customize"); await pg.wait_for_timeout(1200); await pg.screenshot(path=S+"h2_custom_desktop.png")
        await H.setlook(pg,{"bg":"plain","theme":"glacier"},hour=10); await pg.wait_for_timeout(800); await pg.screenshot(path=S+"h2_plain_desktop.png")
        ctx2=await b.new_context(**H.PHONE,ignore_https_errors=True); await T.mock(ctx2,log); pg2=await ctx2.new_page(); T.watch(pg2,errs)
        await pg2.goto(T.BASE+"?nosw#/",wait_until="load"); await H.build(pg2,(datetime.date.today()+datetime.timedelta(days=2)).isoformat())
        await pg2.set_input_files("#photoin",T.PHOTO); await pg2.wait_for_timeout(1200)
        await H.setlook(pg2,{"bg":"photo","dim":30},hour=12,path="#/customize"); await pg2.wait_for_timeout(1200); await pg2.screenshot(path=S+"h2_custom_photo.png")
        await H.setlook(pg2,{"bg":"plain"},hour=12); await pg2.wait_for_timeout(800); await pg2.screenshot(path=S+"h2_plain_phone.png")
        print("ERRORS:","\n".join(e for e in errs if "GPU stall" not in e and "no longer repeat" not in e) or "none")
        await b.close()
asyncio.run(main())
