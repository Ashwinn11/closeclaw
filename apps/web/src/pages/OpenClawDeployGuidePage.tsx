import { Helmet } from 'react-helmet-async';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Header } from '../components/ui/Header';
import { useSEO } from '../hooks/useSEO';
import './SolutionsIndexPage.css';

const SELF_HOST_STEPS = [
  'Create cloud project and enable billing',
  'Provision VM and secure access',
  'Install Docker and compose tooling',
  'Configure env variables and API keys',
  'Wire Telegram/Discord/Slack channels',
  'Monitor uptime, logs, and upgrades',
];

const MANAGED_STEPS = [
  'Choose channel',
  'Authenticate and connect bot token',
  'Deploy dedicated instance',
  'Start using OpenClaw immediately',
];

export const OpenClawDeployGuidePage: React.FC = () => {
  const seo = useSEO({
    title: 'How to Deploy OpenClaw (Step-by-Step)',
    description:
      'Step-by-step OpenClaw deployment guide for self-hosted and managed setups. Learn the fastest way to run OpenClaw on Telegram, Discord, or Slack.',
    keywords: [
      'how to deploy openclaw',
      'openclaw setup guide',
      'openclaw deployment tutorial',
      'openclaw telegram setup',
      'openclaw discord setup',
    ],
    path: '/openclaw-deploy-guide',
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
          <div className="sovereign-badge">Tutorial</div>
          <h1 className="hero-title">How to Deploy OpenClaw: Self-Hosted vs Managed</h1>
          <p className="hero-subtitle">
            If you want OpenClaw running on Telegram, Discord, or Slack, there are two paths: self-hosted setup or managed
            deployment. This guide summarizes both paths in practical steps.
          </p>
        </section>

        <section className="solutions-grid" aria-label="OpenClaw deployment steps">
          <article className="solution-link-card">
            <h2>Self-Hosted OpenClaw Steps</h2>
            <ol>
              {SELF_HOST_STEPS.map((step) => (
                <li key={step} style={{ color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{step}</li>
              ))}
            </ol>
          </article>
          <article className="solution-link-card">
            <h2>Managed OpenClaw Steps</h2>
            <ol>
              {MANAGED_STEPS.map((step) => (
                <li key={step} style={{ color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{step}</li>
              ))}
            </ol>
          </article>
          <article className="solution-link-card">
            <h2>Which path should you choose?</h2>
            <p>
              Choose self-hosting if you want full infrastructure ownership and can absorb ops work.
              Choose managed hosting if speed, uptime, and reduced engineering overhead are more important.
            </p>
            <p>
              See <a href="/openclaw-hosting">OpenClaw Hosting</a> and <a href="/vs-self-hosting">comparison page</a>
              {' '}for direct tradeoffs.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
};
