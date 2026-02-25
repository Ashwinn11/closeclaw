"""
Deep visual SEO audit — checks heading hierarchy, CLS proxies,
font sizes, tap targets, og/twitter meta, canonical, and structured data.
"""
from playwright.sync_api import sync_playwright
import json, sys

def audit(url, viewport_width=1440, viewport_height=900):
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

        # ---- CLS proxy: track layout-shift entries ----
        cls_entries = []
        page.on('console', lambda msg: None)  # suppress noise

        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_timeout(3000)

        # ---- Measure CLS via PerformanceObserver ----
        cls_score = page.evaluate('''() => {
            return new Promise(resolve => {
                let cls = 0;
                try {
                    const entries = performance.getEntriesByType("layout-shift");
                    cls = entries.reduce((sum, e) => sum + e.value, 0);
                } catch(e) {}
                resolve(cls);
            });
        }''')

        # ---- Full heading hierarchy ----
        headings = page.eval_on_selector_all(
            'h1, h2, h3, h4, h5, h6',
            '''els => els.map(el => {
                const r = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return {
                    tag: el.tagName,
                    text: el.innerText.trim().slice(0, 80),
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    top: Math.round(r.top),
                    aboveFold: r.top < window.innerHeight && r.bottom > 0
                };
            })'''
        )

        # ---- All anchor/button tap targets ----
        tap_targets = page.eval_on_selector_all(
            'a, button',
            '''els => els
                .map(el => {
                    const r = el.getBoundingClientRect();
                    return {
                        text: el.innerText.trim().slice(0, 40),
                        tag: el.tagName,
                        width: Math.round(r.width),
                        height: Math.round(r.height),
                        top: Math.round(r.top),
                        tooSmall: r.width < 44 || r.height < 44
                    };
                })
                .filter(t => t.width > 0 && t.height > 0)'''
        )
        small_targets = [t for t in tap_targets if t['tooSmall']]

        # ---- Meta / OG / Twitter tags ----
        def get_meta(selector, attr='content'):
            el = page.query_selector(selector)
            return el.get_attribute(attr) if el else None

        og_title    = get_meta('meta[property="og:title"]')
        og_desc     = get_meta('meta[property="og:description"]')
        og_image    = get_meta('meta[property="og:image"]')
        og_url      = get_meta('meta[property="og:url"]')
        tw_card     = get_meta('meta[name="twitter:card"]')
        tw_title    = get_meta('meta[name="twitter:title"]')
        canonical   = get_meta('link[rel="canonical"]', 'href')
        robots      = get_meta('meta[name="robots"]')
        viewport_m  = get_meta('meta[name="viewport"]')

        # ---- Structured data ----
        ld_json_blocks = page.eval_on_selector_all(
            'script[type="application/ld+json"]',
            'els => els.map(el => el.textContent.trim())'
        )

        # ---- Image alt text audit ----
        images = page.eval_on_selector_all(
            'img',
            '''els => els.map(el => {
                const r = el.getBoundingClientRect();
                return {
                    src: (el.getAttribute("src") || "").slice(-40),
                    alt: el.getAttribute("alt"),
                    hasAlt: (el.getAttribute("alt") || "").trim().length > 0,
                    width: Math.round(r.width),
                    height: Math.round(r.height)
                };
            })'''
        )

        # ---- Font loading check ----
        font_faces = page.evaluate('''() => {
            const fonts = [];
            for (const f of document.fonts) {
                fonts.push({ family: f.family, status: f.status });
            }
            return fonts.slice(0, 10);
        }''')

        # ---- Above-fold body text min font size ----
        body_font_sizes = page.eval_on_selector_all(
            'p, span, li',
            '''els => els
                .filter(el => {
                    const r = el.getBoundingClientRect();
                    return r.top < window.innerHeight && r.bottom > 0 && r.height > 0;
                })
                .map(el => parseFloat(window.getComputedStyle(el).fontSize))
                .filter(s => s > 0)'''
        )
        min_font = min(body_font_sizes) if body_font_sizes else None
        avg_font = round(sum(body_font_sizes)/len(body_font_sizes), 1) if body_font_sizes else None

        browser.close()

        return {
            'url': url,
            'viewport': f'{viewport_width}x{viewport_height}',
            'cls_score': round(cls_score, 4),
            'headings': headings,
            'small_tap_targets_count': len(small_targets),
            'small_tap_targets_sample': small_targets[:5],
            'meta': {
                'og_title': og_title,
                'og_description': og_desc,
                'og_image': og_image,
                'og_url': og_url,
                'twitter_card': tw_card,
                'twitter_title': tw_title,
                'canonical': canonical,
                'robots': robots,
                'viewport': viewport_m,
            },
            'structured_data_count': len(ld_json_blocks),
            'structured_data': ld_json_blocks,
            'images': images,
            'images_missing_alt': [i for i in images if not i['hasAlt']],
            'fonts': font_faces,
            'min_above_fold_font_px': min_font,
            'avg_above_fold_font_px': avg_font,
        }


if __name__ == '__main__':
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://closeclaw.in'
    w   = int(sys.argv[2]) if len(sys.argv) > 2 else 1440
    h   = int(sys.argv[3]) if len(sys.argv) > 3 else 900
    result = audit(url, w, h)
    print(json.dumps(result, indent=2))
