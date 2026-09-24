import asyncio
from playwright.async_api import async_playwright
import os

PAGES = [
    "index.html",
    "produtos.html",
    "movimentacoes.html",
    "consultas.html",
    "implementacao.html",
    "obras.html",
    "reservas.html",
    "configuracoes.html"
]

VIEWPORTS = [
    {"width": 1440, "height": 900, "name": "1440_desktop"},
    {"width": 1024, "height": 768, "name": "1024_tablet_landscape"},
    {"width": 768, "height": 1024, "name": "768_tablet_portrait"},
    {"width": 430, "height": 932, "name": "430_mobile_large"},
    {"width": 390, "height": 844, "name": "390_mobile_small"}
]

async def take_screenshots():
    os.makedirs("screenshots", exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        for viewport in VIEWPORTS:
            context = await browser.new_context(viewport={"width": viewport["width"], "height": viewport["height"]})
            page = await context.new_page()

            for p_name in PAGES:
                url = f"http://localhost:8000/{p_name}"
                try:
                    await page.goto(url, wait_until="load", timeout=10000)

                    # Interagir com page (fechar loaders, esperar render)
                    try:
                        loader = await page.wait_for_selector("#loading-overlay", state="hidden", timeout=5000)
                    except:
                        pass

                    await asyncio.sleep(2) # Pequeno sleep extra para estabilizar

                    screenshot_name = f"screenshots/{p_name}_{viewport['name']}.png"
                    await page.screenshot(path=screenshot_name, full_page=True)
                    print(f"Captured: {screenshot_name}")
                except Exception as e:
                    print(f"Error capturing {p_name} at {viewport['name']}: {e}")

            await context.close()

        await browser.close()

asyncio.run(take_screenshots())
