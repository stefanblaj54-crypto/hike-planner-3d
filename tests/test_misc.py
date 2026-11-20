"""Smaller interactions: rename, move a night, walk the day, forecast update, delete, dark mode."""
import asyncio, datetime
from playwright.async_api import async_playwright
import test_app as T

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=T.CHROME, headless=True, args=T.ARGS)
        ctx = await b.new_context(viewport={"width": 1280, "height": 860}, ignore_https_errors=True, color_scheme="dark")
        log, errs = [], []; await T.mock(ctx, log)
        pg = await ctx.new_page(); T.watch(pg, errs)
        await pg.goto(T.BASE + "?nosw#/new", wait_until="load"); await pg.wait_for_timeout(800)
        await pg.click("#tab-file"); await pg.set_input_files("#file", T.GPX); await pg.wait_for_timeout(600)
        await pg.click("#reverse"); await pg.wait_for_timeout(300)
        d = (datetime.date.today() + datetime.timedelta(days=20)).isoformat()
        await pg.fill("#hdate", d); await pg.dispatch_event("#hdate", "input"); await pg.select_option("#hdays", "3")
        await T.build_and_wait(pg); await pg.wait_for_timeout(1500)
        print("REVERSED:", (await pg.inner_text("#tbl tbody")).replace("\n", " | ").replace("\t", " ")[:400])
        print("FC chip disabled:", await pg.get_attribute("[data-wx='fc']", "aria-disabled"), "| title:", await pg.get_attribute("[data-wx='fc']", "title"))
        await pg.screenshot(path=T.SHOTS + "x_dark_view.png")
        # rename
        await pg.click("#more"); await pg.click("[data-act='rename']"); await pg.fill("#dlginput", "Bärentrek backwards"); await pg.click("#dlgok"); await pg.wait_for_timeout(1200)
        print("RENAMED:", await pg.inner_text("#ttl"))
        # move a night: pick a point on the profile, then press the button in the readout
        await pg.locator("#prof").scroll_into_view_if_needed(); box = await pg.locator("#prof").bounding_box()
        await pg.mouse.move(box["x"] + 50 + (box["width"] - 64) * .40, box["y"] + box["height"] * .4); await pg.wait_for_timeout(300)
        await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(300)
        before = (await pg.inner_text("#tbl tbody")).split("\n")[0:2]
        await pg.click("[data-night]"); await pg.wait_for_timeout(800)
        after = (await pg.inner_text("#tbl tbody")).split("\n")[0:2]
        print("MOVE NIGHT:", before, "->", after)
        # walk day 2
        await pg.click("[data-day='2']"); await pg.wait_for_timeout(1300); await pg.click("#play"); await pg.wait_for_timeout(4000)
        print("PLAYING:", await pg.inner_text("#play"), "| tag:", await pg.inner_text("#tag"))
        await pg.screenshot(path=T.SHOTS + "x_play.png")
        await pg.click("#play")
        # change the date into the forecast window: the forecast loads by itself
        d2 = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        await pg.fill("#vdate", d2); await pg.dispatch_event("#vdate", "change"); await pg.wait_for_timeout(2500)
        print("AFTER DATE CHANGE wx:", await pg.evaluate("document.querySelector('.wchip[aria-pressed=true]').dataset.wx"), "| requests:", log)
        await pg.click("[data-day='0']"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=T.SHOTS + "x_dark_fc.png")
        # home in dark mode, then delete
        await pg.click("#back"); await pg.wait_for_timeout(1000)
        await pg.screenshot(path=T.SHOTS + "x_dark_home.png")
        print("HOME:", (await pg.inner_text("#hikes")).replace("\n", " | "))
        await pg.click(".hike"); await pg.wait_for_function("document.querySelector('#msg').hidden", timeout=60000)
        await pg.click("#more"); await pg.click("[data-act='delete']"); await pg.wait_for_timeout(300)
        print("CONFIRM:", await pg.inner_text("#dlgmsg")); await pg.click("#dlgok"); await pg.wait_for_timeout(1200)
        print("AFTER DELETE:", (await pg.inner_text("#hikes"))[:80], "| hash:", await pg.evaluate("location.hash"))
        print("ERRORS:", "\n".join(e for e in errs if "GPU stall" not in e and "no longer repeat" not in e) or "none")
        await b.close()

asyncio.run(main())
