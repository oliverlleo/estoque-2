
from playwright.sync_api import sync_playwright

def verify_percentage_tooltip():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to obras.html...")
        page.goto("http://localhost:8000/obras.html")

        try:
            page.wait_for_selector(".obra-card", timeout=10000)
        except:
            print("Timeout waiting for cards.")
            browser.close()
            return

        # Find a card with non-zero cost
        cards = page.locator(".obra-card")
        target_card_index = 0
        for i in range(cards.count()):
            if "0,00" not in cards.nth(i).locator(".obra-custo").inner_text():
                target_card_index = i
                break

        print(f"Clicking card {target_card_index}...")
        with page.expect_navigation():
            cards.nth(target_card_index).locator(".btn-ver-mais").click()

        page.wait_for_selector("#obra-titulo")
        page.wait_for_function("document.getElementById('obra-titulo').textContent !== 'Carregando...'", timeout=10000)

        # Now verify the chart is visible. Charts are canvas elements.
        # #groupChart
        chart = page.locator("#groupChart")
        if not chart.is_visible():
            print("Chart not visible.")
            browser.close()
            return

        print("Chart is visible. Hovering to check tooltip...")

        # Hover over the chart center/area
        box = chart.bounding_box()
        if box:
            center_x = box["x"] + box["width"] / 2
            center_y = box["y"] + box["height"] / 2

            # Hover slightly off center to hit a slice (it's a doughnut)
            # Assuming standard doughnut, slices are in the ring.
            # Radius approx width/2. Ring width is usually chart setting.
            # Let's try to hover at width/2 + width/4.

            # Actually, standard doughnut chart.
            # Let's move mouse to (x + width*0.75, y + height/2)
            page.mouse.move(box["x"] + box["width"] * 0.75, center_y)
            page.wait_for_timeout(500)

            # Tooltip is usually rendered in a separate element or on canvas.
            # Chart.js tooltips are on canvas by default. DOM inspection might not show them as elements.
            # However, we can take a screenshot and visually verify if we could see it.
            # We can't programmatically read the tooltip text easily if it's canvas-drawn.

            # I will just take a screenshot of the hover state.
            page.screenshot(path="verification/verify_chart_tooltip.png")
            print("Screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_percentage_tooltip()
