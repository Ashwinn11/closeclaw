import { Helmet } from 'react-helmet-async';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Header } from '../components/ui/Header';
import { useSEO } from '../hooks/useSEO';
import './SolutionsIndexPage.css';

export const OpenClawHostingPage: React.FC = () => {
  const seo = useSEO({
    title: 'OpenClaw Hosting (No Docker)',
    description:
      'Managed OpenClaw hosting with no Docker, no VPS setup, and no infrastructure maintenance. Deploy a private OpenClaw instance in 60 seconds.',
    keywords: [
      'openclaw hosting',
      'managed openclaw hosting',
      'openclaw no docker',
      'openclaw cloud hosting',
      'private openclaw server',
    ],
    path: '/openclaw-hosting',
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
          <div className="sovereign-badge">High-Intent Page</div>
          <h1 className="hero-title">OpenClaw Hosting Without Docker or VPS Setup</h1>
          <p className="hero-subtitle">
            CloseClaw gives you managed OpenClaw hosting on a dedicated private VM. You keep the official OpenClaw core,
            but skip Docker provisioning, firewall setup, uptime monitoring, and patching.
          </p>
        </section>

        <section className="solutions-grid" aria-label="OpenClaw hosting benefits">
          <article className="solution-link-card">
            <h2>Why teams choose managed OpenClaw hosting</h2>
            <p>
              Self-hosting usually starts at 60+ minutes and expands into weekly maintenance. Managed hosting lets teams
              deploy in roughly 60 seconds and focus on workflows instead of ops.
            </p>
          </article>
          <article className="solution-link-card">
            <h2>Private infrastructure by default</h2>
            <p>
              Each instance runs on isolated infrastructure with no shared tenant runtime. This helps teams with legal,
              healthcare, and financial confidentiality needs.
            </p>
          </article>
          <article className="solution-link-card">
            <h2>OpenClaw features remain the same</h2>
            <p>
              You still get multi-model routing, web browsing, skills, and channel integrations. The difference is that
              infrastructure lifecycle is managed for you.
            </p>
          </article>
        </section>

        <section className="solutions-hero" style={{ paddingTop: '1.5rem' }}>
          <h2 className="hero-title" style={{ fontSize: 'var(--text-4xl)' }}>Next Steps</h2>
          <p className="hero-subtitle">
            Compare approaches on <a href="/vs-self-hosting">Self-Hosting vs Managed</a>, explore use cases on
            <a href="/solutions"> Solutions Hub</a>, or read the setup walkthrough on
            <a href="/openclaw-deploy-guide"> OpenClaw Deployment Guide</a>.
          </p>
        </section>
      </main>
    </div>
  );
};
