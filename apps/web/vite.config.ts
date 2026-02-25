import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface SolutionEntry {
  id: string
}

function buildSitemapXml(solutions: SolutionEntry[]): string {
  const today = new Date().toISOString().split('T')[0]

  const staticUrls = [
    { loc: 'https://closeclaw.in/', changefreq: 'weekly', priority: '1.0' },
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

function sitemapPlugin(): Plugin {
  const dataPath = resolve(__dirname, 'src/data/pseo-solutions.json')

  function writeSitemap(outputPath: string): void {
    const solutions: SolutionEntry[] = JSON.parse(readFileSync(dataPath, 'utf-8'))
    writeFileSync(outputPath, buildSitemapXml(solutions), 'utf-8')
  }

  return {
    name: 'vite-plugin-sitemap',
    // Runs before Vite copies public/ → dist/, so public/sitemap.xml is up-to-date
    buildStart() {
      writeSitemap(resolve(__dirname, 'public/sitemap.xml'))
    },
    // Also write directly into dist/ after bundle, in case timing differs
    closeBundle() {
      const distPath = resolve(__dirname, 'dist/sitemap.xml')
      if (existsSync(resolve(__dirname, 'dist'))) {
        writeSitemap(distPath)
      }
    },
  }
}

/**
 * Prerender plugin — after the bundle is written, uses a headless approach:
 * copies index.html into each /solutions/<id>/ directory so Vercel/CDN
 * serves per-page HTML with unique <title>, <meta>, and JSON-LD.
 *
 * We inject per-page meta by reading the solution JSON and writing
 * a modified index.html with inline meta overrides that react-helmet-async
 * then hydrates over.
 */
function prerenderPlugin(): Plugin {
  const dataPath = resolve(__dirname, 'src/data/pseo-solutions.json')

  return {
    name: 'vite-plugin-prerender-solutions',
    enforce: 'post',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist')
      if (!existsSync(distDir)) return

      const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf-8')
      const solutions = JSON.parse(readFileSync(dataPath, 'utf-8')) as Array<{
        id: string
        title: string
        description: string
        keywords: string[]
        industry: string
        location: string
      }>

      for (const s of solutions) {
        const pageDir = resolve(distDir, 'solutions', s.id)
        mkdirSync(pageDir, { recursive: true })

        const pageTitle = `${s.title} | CloseClaw`
        const canonical = `https://closeclaw.in/solutions/${s.id}`
        const ogDesc = s.description

        // Replace default meta in the HTML shell with solution-specific values
        let pageHtml = indexHtml
          .replace(
            /<title>[^<]*<\/title>/,
            `<title>${pageTitle}</title>`,
          )
          .replace(
            /<meta name="description"[^>]*\/>/,
            `<meta name="description" content="${ogDesc.replace(/"/g, '&quot;')}" />`,
          )
          .replace(
            /<meta property="og:title"[^>]*\/>/,
            `<meta property="og:title" content="${pageTitle.replace(/"/g, '&quot;')}" />`,
          )
          .replace(
            /<meta property="og:description"[^>]*\/>/,
            `<meta property="og:description" content="${ogDesc.replace(/"/g, '&quot;')}" />`,
          )
          .replace(
            /<meta property="og:url"[^>]*\/>/,
            `<meta property="og:url" content="${canonical}" />`,
          )
          .replace(
            /<meta name="twitter:title"[^>]*\/>/,
            `<meta name="twitter:title" content="${pageTitle.replace(/"/g, '&quot;')}" />`,
          )
          .replace(
            /<meta name="twitter:description"[^>]*\/>/,
            `<meta name="twitter:description" content="${ogDesc.replace(/"/g, '&quot;')}" />`,
          )

        // Insert canonical link before </head>
        pageHtml = pageHtml.replace(
          '</head>',
          `  <link rel="canonical" href="${canonical}" />\n</head>`,
        )

        writeFileSync(resolve(pageDir, 'index.html'), pageHtml, 'utf-8')
      }

      console.log(`✅ Prerendered ${solutions.length} solution pages`)
    },
  }
}

// https://vite.dev/config/
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

