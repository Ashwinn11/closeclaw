import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface SolutionEntry {
  id: string
  industry: string
  location: string
  title: string
  description: string
  keywords: string[]
  regulation_name: string
  compliance_detail: string
  local_context: string
  workflow_example: string
  industry_faqs?: Array<{ q: string; a: string }>
}

interface HighIntentPage {
  slug: string
  title: string
  description: string
  bodyHtml: string
}

const HIGH_INTENT_PAGES: HighIntentPage[] = [
  {
    slug: 'openclaw-hosting',
    title: 'OpenClaw Hosting (No Docker) | CloseClaw',
    description:
      'Managed OpenClaw hosting with no Docker, no VPS setup, and no infrastructure maintenance. Deploy a private OpenClaw instance in 60 seconds.',
    bodyHtml: `
      <main style="max-width:980px;margin:0 auto;padding:120px 20px 40px;color:#f5f7fb;font-family:Outfit,system-ui,sans-serif">
        <p style="margin:0 0 8px;color:#ff5a5f;letter-spacing:.08em;text-transform:uppercase">High-Intent Page</p>
        <h1 style="margin:0 0 12px;font-size:42px;line-height:1.15">OpenClaw Hosting Without Docker or VPS Setup</h1>
        <p style="margin:0 0 16px;color:#aab4c4;line-height:1.65">Managed OpenClaw hosting lets teams use the official OpenClaw core while avoiding infrastructure setup and weekly maintenance overhead.</p>
        <ul style="margin:0 0 14px;padding-left:20px;display:grid;gap:8px;line-height:1.6">
          <li>Deploy in around 60 seconds with a private dedicated instance.</li>
          <li>Keep channel integrations (Telegram/Discord/Slack) without manual server upkeep.</li>
          <li>Reduce ops workload from provisioning, patching, and uptime monitoring.</li>
        </ul>
        <p style="margin:0"><a href="/vs-self-hosting">Compare self-hosting vs managed</a> • <a href="/solutions">Browse solution pages</a></p>
      </main>`,
  },
  {
    slug: 'openclaw-deploy-guide',
    title: 'How to Deploy OpenClaw (Step-by-Step) | CloseClaw',
    description:
      'Step-by-step OpenClaw deployment guide for self-hosted and managed setups. Learn the fastest way to run OpenClaw on Telegram, Discord, or Slack.',
    bodyHtml: `
      <main style="max-width:980px;margin:0 auto;padding:120px 20px 40px;color:#f5f7fb;font-family:Outfit,system-ui,sans-serif">
        <p style="margin:0 0 8px;color:#ff5a5f;letter-spacing:.08em;text-transform:uppercase">Tutorial</p>
        <h1 style="margin:0 0 12px;font-size:42px;line-height:1.15">How to Deploy OpenClaw: Self-Hosted vs Managed</h1>
        <p style="margin:0 0 16px;color:#aab4c4;line-height:1.65">This deployment guide outlines the practical setup steps for both approaches so teams can choose by speed, control, and maintenance requirements.</p>
        <ul style="margin:0 0 14px;padding-left:20px;display:grid;gap:8px;line-height:1.6">
          <li>Self-hosted path: cloud project, VM, Docker setup, env wiring, ongoing maintenance.</li>
          <li>Managed path: channel connection, instance deployment, immediate usage.</li>
          <li>Choose based on ops bandwidth and uptime requirements.</li>
        </ul>
        <p style="margin:0"><a href="/openclaw-hosting">OpenClaw hosting page</a> • <a href="/openclaw-telegram-discord">Telegram/Discord setup</a></p>
      </main>`,
  },
  {
    slug: 'openclaw-telegram-discord',
    title: 'OpenClaw on Telegram and Discord | CloseClaw',
    description:
      'Run OpenClaw on Telegram or Discord with a private managed instance. Connect channels quickly and avoid infrastructure setup complexity.',
    bodyHtml: `
      <main style="max-width:980px;margin:0 auto;padding:120px 20px 40px;color:#f5f7fb;font-family:Outfit,system-ui,sans-serif">
        <p style="margin:0 0 8px;color:#ff5a5f;letter-spacing:.08em;text-transform:uppercase">Channel Setup</p>
        <h1 style="margin:0 0 12px;font-size:42px;line-height:1.15">Deploy OpenClaw on Telegram or Discord</h1>
        <p style="margin:0 0 16px;color:#aab4c4;line-height:1.65">Connect OpenClaw to the channels your team already uses while keeping runtime infrastructure private and managed.</p>
        <ul style="margin:0 0 14px;padding-left:20px;display:grid;gap:8px;line-height:1.6">
          <li>Telegram: connect bot token and start conversations in private channel workflows.</li>
          <li>Discord: configure app permissions and use OpenClaw directly in team servers.</li>
          <li>Managed deployment reduces restart and integration drift issues.</li>
        </ul>
        <p style="margin:0"><a href="/openclaw-deploy-guide">Deployment guide</a> • <a href="/solutions">Industry solutions</a></p>
      </main>`,
  },
]

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildSitemapXml(solutions: SolutionEntry[]): string {
  const today = new Date().toISOString().split('T')[0]

  const staticUrls = [
    { loc: 'https://closeclaw.in/', changefreq: 'weekly', priority: '1.0' },
    { loc: 'https://closeclaw.in/solutions', changefreq: 'weekly', priority: '0.9' },
    { loc: 'https://closeclaw.in/vs-self-hosting', changefreq: 'monthly', priority: '0.9' },
    ...HIGH_INTENT_PAGES.map((page) => ({
      loc: `https://closeclaw.in/${page.slug}`,
      changefreq: 'weekly',
      priority: '0.9',
    })),
  ]

  const solutionUrls = solutions.map((s) => ({
    loc: `https://closeclaw.in/solutions/${s.id}`,
    changefreq: 'monthly',
    priority: '0.8',
  }))

  const allUrls = [...staticUrls, ...solutionUrls]

  const entries = allUrls
    .map(
      ({ loc, changefreq, priority }) =>
        `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
}

function buildSolutionsHubStaticHtml(solutions: SolutionEntry[]): string {
  const cards = solutions
    .map(
      (s) => `
      <article style="padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(10,10,15,.72)">
        <p style="margin:0 0 6px;color:#6ddbcf;font-size:14px">${escapeHtml(s.industry)} • ${escapeHtml(s.location)}</p>
        <h2 style="margin:0 0 8px;font-size:24px;line-height:1.3"><a href="/solutions/${escapeHtml(s.id)}" style="color:#f5f7fb;text-decoration:none">${escapeHtml(s.title)}</a></h2>
        <p style="margin:0;color:#aab4c4;line-height:1.55">${escapeHtml(s.description)}</p>
      </article>`,
    )
    .join('')

  return `
    <main style="max-width:1200px;margin:0 auto;padding:120px 20px 40px;color:#f5f7fb;font-family:Outfit,system-ui,sans-serif">
      <p style="margin:0 0 8px;color:#ff5a5f;letter-spacing:.08em;text-transform:uppercase">Solutions Hub</p>
      <h1 style="margin:0 0 10px;font-size:44px;line-height:1.15">OpenClaw Solutions by Industry and City</h1>
      <p style="margin:0 0 26px;color:#aab4c4;line-height:1.6">${solutions.length} focused pages for regulated and confidential workflows.</p>
      <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:12px">${cards}</section>
    </main>`
}

function buildSolutionStaticHtml(solution: SolutionEntry, solutions: SolutionEntry[]): string {
  const related = solutions
    .filter((s) => s.id !== solution.id && (s.industry === solution.industry || s.location === solution.location))
    .slice(0, 5)

  const faqItems = (solution.industry_faqs ?? [])
    .slice(0, 4)
    .map(
      (faq) => `
      <article style="padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02)">
        <h3 style="margin:0 0 6px;font-size:18px">${escapeHtml(faq.q)}</h3>
        <p style="margin:0;color:#aab4c4;line-height:1.55">${escapeHtml(faq.a)}</p>
      </article>`,
    )
    .join('')

  const relatedLinks = related
    .map((s) => `<li><a href="/solutions/${escapeHtml(s.id)}">${escapeHtml(s.title)}</a></li>`)
    .join('')

  return `
    <main style="max-width:980px;margin:0 auto;padding:120px 20px 40px;color:#f5f7fb;font-family:Outfit,system-ui,sans-serif">
      <p style="margin:0 0 8px;color:#6ddbcf;font-size:14px">${escapeHtml(solution.industry)} • ${escapeHtml(solution.location)}</p>
      <h1 style="margin:0 0 12px;font-size:42px;line-height:1.15">${escapeHtml(solution.title)}</h1>
      <p style="margin:0 0 20px;color:#aab4c4;line-height:1.65">${escapeHtml(solution.description)}</p>

      <section style="margin:0 0 20px;padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(10,10,15,.72)">
        <h2 style="margin:0 0 8px;font-size:24px">Compliance: ${escapeHtml(solution.regulation_name)}</h2>
        <p style="margin:0;color:#aab4c4;line-height:1.6">${escapeHtml(solution.compliance_detail)}</p>
      </section>

      <section style="margin:0 0 20px;padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(10,10,15,.72)">
        <h2 style="margin:0 0 8px;font-size:24px">Local Context</h2>
        <p style="margin:0;color:#aab4c4;line-height:1.6">${escapeHtml(solution.local_context)}</p>
      </section>

      <section style="margin:0 0 20px;padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(10,10,15,.72)">
        <h2 style="margin:0 0 8px;font-size:24px">Workflow Example</h2>
        <p style="margin:0;color:#aab4c4;line-height:1.6">${escapeHtml(solution.workflow_example)}</p>
      </section>

      <section style="margin:0 0 20px;display:grid;gap:8px">
        <h2 style="margin:0;font-size:24px">FAQs</h2>
        ${faqItems || '<p style="margin:0;color:#aab4c4">No FAQs listed.</p>'}
      </section>

      <section style="margin:0 0 20px;padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(10,10,15,.72)">
        <h2 style="margin:0 0 8px;font-size:24px">Related Solution Pages</h2>
        <ul style="margin:0;padding-left:20px;display:grid;gap:6px">${relatedLinks}</ul>
      </section>

      <p style="margin:0"><a href="/solutions">Browse all solution pages</a> • <a href="/">Home</a></p>
    </main>`
}

function buildVsStaticHtml(): string {
  return `
    <main style="max-width:980px;margin:0 auto;padding:120px 20px 40px;color:#f5f7fb;font-family:Outfit,system-ui,sans-serif">
      <p style="margin:0 0 8px;color:#ff5a5f;letter-spacing:.08em;text-transform:uppercase">Compare</p>
      <h1 style="margin:0 0 12px;font-size:42px;line-height:1.15">OpenClaw Self-Hosting vs Managed Hosting</h1>
      <p style="margin:0 0 16px;color:#aab4c4;line-height:1.65">Self-hosting gives full ops control but requires ongoing maintenance. CloseClaw keeps the same OpenClaw core while removing infrastructure work.</p>
      <ul style="margin:0 0 14px;padding-left:20px;display:grid;gap:8px;line-height:1.6">
        <li>Self-hosting setup often takes 60+ minutes and continues with ongoing patching/monitoring.</li>
        <li>Managed hosting deploys in around 60 seconds with uptime and patch management included.</li>
        <li>Both approaches can support private infrastructure; the tradeoff is operational burden.</li>
      </ul>
      <p style="margin:0"><a href="/">Back to homepage</a> • <a href="/solutions">Browse industry solutions</a></p>
    </main>`
}

function replaceRootContent(html: string, content: string): string {
  if (html.includes('<div id="root"></div>')) {
    return html.replace('<div id="root"></div>', `<div id="root">${content}</div>`)
  }

  return html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${content}</div>`)
}

function applyMetaTags(html: string, title: string, description: string, canonical: string): string {
  let nextHtml = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description"[^>]*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:title"[^>]*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta property="og:description"[^>]*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:url"[^>]*\/>/, `<meta property="og:url" content="${escapeHtml(canonical)}" />`)
    .replace(/<meta name="twitter:title"[^>]*\/>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta name="twitter:description"[^>]*\/>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`)

  nextHtml = nextHtml.replace(/\s*<link rel="canonical"[^>]*>/g, '')
  nextHtml = nextHtml.replace('</head>', `  <link rel="canonical" href="${escapeHtml(canonical)}" />\n</head>`)

  return nextHtml
}

function sitemapPlugin(): Plugin {
  const dataPath = resolve(__dirname, 'src/data/pseo-solutions.json')

  function writeSitemap(outputPath: string): void {
    const solutions: SolutionEntry[] = JSON.parse(readFileSync(dataPath, 'utf-8'))
    writeFileSync(outputPath, buildSitemapXml(solutions), 'utf-8')
  }

  return {
    name: 'vite-plugin-sitemap',
    buildStart() {
      writeSitemap(resolve(__dirname, 'public/sitemap.xml'))
    },
    closeBundle() {
      const distPath = resolve(__dirname, 'dist/sitemap.xml')
      if (existsSync(resolve(__dirname, 'dist'))) {
        writeSitemap(distPath)
      }
    },
  }
}

function prerenderPlugin(): Plugin {
  const dataPath = resolve(__dirname, 'src/data/pseo-solutions.json')

  return {
    name: 'vite-plugin-prerender-solutions',
    enforce: 'post',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist')
      if (!existsSync(distDir)) return

      const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf-8')
      const solutions = JSON.parse(readFileSync(dataPath, 'utf-8')) as SolutionEntry[]

      for (const s of solutions) {
        const pageDir = resolve(distDir, 'solutions', s.id)
        mkdirSync(pageDir, { recursive: true })

        const pageTitle = `${s.title} | CloseClaw`
        const canonical = `https://closeclaw.in/solutions/${s.id}`
        const pageDesc = s.description

        const webPageSchema = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': `${canonical}#webpage`,
          name: pageTitle,
          description: pageDesc,
          url: canonical,
        }).replace(/</g, '\\u003c')

        let pageHtml = applyMetaTags(indexHtml, pageTitle, pageDesc, canonical)
        pageHtml = replaceRootContent(pageHtml, buildSolutionStaticHtml(s, solutions))
        pageHtml = pageHtml.replace(
          '</head>',
          `  <script type="application/ld+json">${webPageSchema}</script>\n</head>`,
        )

        writeFileSync(resolve(pageDir, 'index.html'), pageHtml, 'utf-8')
      }

      const hubDir = resolve(distDir, 'solutions')
      mkdirSync(hubDir, { recursive: true })
      const hubTitle = 'OpenClaw Industry Solutions | CloseClaw'
      const hubDesc =
        'Explore OpenClaw solution pages by industry and city. Private, dedicated AI infrastructure for legal, healthcare, fintech, government, and research teams.'
      const hubCanonical = 'https://closeclaw.in/solutions'
      let hubHtml = applyMetaTags(indexHtml, hubTitle, hubDesc, hubCanonical)
      hubHtml = replaceRootContent(hubHtml, buildSolutionsHubStaticHtml(solutions))
      writeFileSync(resolve(hubDir, 'index.html'), hubHtml, 'utf-8')

      const vsDir = resolve(distDir, 'vs-self-hosting')
      mkdirSync(vsDir, { recursive: true })
      const vsTitle = 'OpenClaw: Self-Hosting vs Managed Hosting | CloseClaw'
      const vsDesc =
        'Compare self-hosting OpenClaw on Docker/GCP with CloseClaw managed hosting. Skip the 60-minute setup and ongoing infrastructure maintenance.'
      const vsCanonical = 'https://closeclaw.in/vs-self-hosting'
      let vsHtml = applyMetaTags(indexHtml, vsTitle, vsDesc, vsCanonical)
      vsHtml = replaceRootContent(vsHtml, buildVsStaticHtml())
      writeFileSync(resolve(vsDir, 'index.html'), vsHtml, 'utf-8')

      for (const page of HIGH_INTENT_PAGES) {
        const pageDir = resolve(distDir, page.slug)
        mkdirSync(pageDir, { recursive: true })
        const canonical = `https://closeclaw.in/${page.slug}`
        let pageHtml = applyMetaTags(indexHtml, page.title, page.description, canonical)
        pageHtml = replaceRootContent(pageHtml, page.bodyHtml)
        writeFileSync(resolve(pageDir, 'index.html'), pageHtml, 'utf-8')
      }

      console.log(`✅ Prerendered ${solutions.length} solution pages + /solutions + /vs-self-hosting + ${HIGH_INTENT_PAGES.length} intent pages`)
    },
  }
}

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    sitemapPlugin(),
    prerenderPlugin(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-router': ['react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
})
