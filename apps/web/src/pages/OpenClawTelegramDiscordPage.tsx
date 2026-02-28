import { Helmet } from 'react-helmet-async';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Header } from '../components/ui/Header';
import { useSEO } from '../hooks/useSEO';
import './SolutionsIndexPage.css';

export const OpenClawTelegramDiscordPage: React.FC = () => {
  const seo = useSEO({
    title: 'OpenClaw on Telegram and Discord',
    description:
      'Run OpenClaw on Telegram or Discord with a private managed instance. Connect channels quickly and avoid infrastructure setup complexity.',
    keywords: [
      'openclaw telegram',
      'openclaw discord',
      'openclaw telegram bot setup',
      'openclaw discord bot setup',
      'managed openclaw channels',
    ],
    path: '/openclaw-telegram-discord',
  });

  return (
    <div className="landing-page solutions-index-page">
      <Helmet>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <meta name="keywords" content={seo.keywords} />
        <link rel="canonical" href={seo.canonical} />
        <meta property="og:title" content={seo.ogTitle} />
        <meta property="og:description" content={seo.ogDescription} />
        <meta property="og:url" content={seo.ogUrl} />
        <meta property="og:image" content={seo.ogImage} />
        <meta name="twitter:title" content={seo.ogTitle} />
        <meta name="twitter:description" content={seo.ogDescription} />
        <script type="application/ld+json">{JSON.stringify(seo.breadcrumbSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(seo.webPageSchema)}</script>
      </Helmet>

      <NebulaBackground />
      <Header />

      <main className="content-wrapper solutions-content">
        <section className="solutions-hero">
          <div className="sovereign-badge">Channel Setup</div>
          <h1 className="hero-title">Deploy OpenClaw on Telegram or Discord</h1>
          <p className="hero-subtitle">
            Set up OpenClaw where your team already works. Connect Telegram or Discord to a private dedicated instance,
            then keep conversations and workflows in one place.
          </p>
        </section>

        <section className="solutions-grid" aria-label="Channel deployment guidance">
          <article className="solution-link-card">
            <h2>Telegram Setup</h2>
            <p>
              Create a Telegram bot token, connect it during onboarding, and your OpenClaw instance is available in your
              private chat workflows.
            </p>
          </article>
          <article className="solution-link-card">
            <h2>Discord Setup</h2>
            <p>
              Register your Discord app, grant required permissions, and link it to your instance so teams can use
              OpenClaw directly in channels.
            </p>
          </article>
          <article className="solution-link-card">
            <h2>Security and reliability</h2>
            <p>
              Managed deployment keeps your OpenClaw runtime isolated and always-on, while reducing manual restarts and
              channel integration breakage.
            </p>
            <p>
              Continue with <a href="/openclaw-deploy-guide">deployment guide</a> or browse sector pages on
              <a href="/solutions"> solutions hub</a>.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
};
