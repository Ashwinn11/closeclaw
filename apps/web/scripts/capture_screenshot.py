from playwright.sync_api import sync_playwright
import os

def capture(url, output_path, viewport_width=1920, viewport_height=1080, wait_ms=3000):
    """
    Capture a screenshot of a URL at the given viewport.
    wait_ms: extra milliseconds to wait after networkidle so JS/fonts render.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': viewport_width, 'height': viewport_height},
            user_agent=(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            )
        )
        page = context.new_page()
        page.goto(url, wait_until='networkidle', timeout=60000)
        # Extra wait for React hydration and font/image load
        page.wait_for_timeout(wait_ms)
        # Collect page metadata
        title = page.title()
        h1s = page.eval_on_selector_all('h1', 'els => els.map(e => e.innerText.trim())')
        h2s = page.eval_on_selector_all('h2', 'els => els.map(e => e.innerText.trim())')
        meta_desc = page.eval_on_selector(
            'meta[name="description"]',
            'el => el ? el.getAttribute("content") : null'
        ) if page.query_selector('meta[name="description"]') else None

        # Detect CTAs (buttons and anchors with common CTA text or classes)
        ctas = page.eval_on_selector_all(
            'a, button',
            '''els => els
                .filter(el => {
                    const t = el.innerText.trim().toLowerCase();
                    return t.includes("get") || t.includes("start") || t.includes("book") ||
                           t.includes("contact") || t.includes("try") || t.includes("demo") ||
                           t.includes("free") || t.includes("sign") || t.includes("request");
                })
                .slice(0, 8)
                .map(el => {
                    const r = el.getBoundingClientRect();
                    return {
                        text: el.innerText.trim(),
                        tag: el.tagName,
                        top: Math.round(r.top),
                        left: Math.round(r.left),
                        width: Math.round(r.width),
                        height: Math.round(r.height),
                        visible: r.top < window.innerHeight && r.bottom > 0
                    };
                })'''
        )

        # Check for horizontal scroll
        scroll_width = page.evaluate('document.documentElement.scrollWidth')
        client_width = page.evaluate('document.documentElement.clientWidth')
        has_h_scroll = scroll_width > client_width

        # Logo detection
        logo_candidates = page.eval_on_selector_all(
            'img, svg',
            '''els => els
                .filter(el => {
                    const src = (el.getAttribute("src") || el.getAttribute("alt") || el.getAttribute("aria-label") || "").toLowerCase();
                    return src.includes("logo") || el.closest("header") !== null || el.closest("nav") !== null;
                })
                .slice(0, 3)
                .map(el => {
                    const r = el.getBoundingClientRect();
                    return { tag: el.tagName, src: el.getAttribute("src") || "(svg)", visible: r.top < window.innerHeight };
                })'''
        )

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        page.screenshot(path=output_path, full_page=False)
        browser.close()

        return {
            'title': title,
            'h1s': h1s,
            'h2s': h2s[:5],
            'meta_description': meta_desc,
            'ctas': ctas,
            'has_horizontal_scroll': has_h_scroll,
            'scroll_width': scroll_width,
            'client_width': client_width,
            'logo_candidates': logo_candidates,
        }


if __name__ == '__main__':
    import json, sys
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://closeclaw.in'
    out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/screenshot.png'
    w   = int(sys.argv[3]) if len(sys.argv) > 3 else 1440
    h   = int(sys.argv[4]) if len(sys.argv) > 4 else 900
    result = capture(url, out, w, h)
    print(json.dumps(result, indent=2))
