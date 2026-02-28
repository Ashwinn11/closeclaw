import { Helmet } from 'react-helmet-async';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Header } from '../components/ui/Header';
import { useSEO } from '../hooks/useSEO';
import solutions from '../data/pseo-solutions.json';
import './SolutionsIndexPage.css';

const sortedSolutions = [...solutions].sort((a, b) =>
  `${a.industry}-${a.location}`.localeCompare(`${b.industry}-${b.location}`),
);

export const SolutionsIndexPage: React.FC = () => {
  const seo = useSEO({
    title: 'OpenClaw Industry Solutions',
    description:
      'Explore CloseClaw OpenClaw deployments by industry and city. Dedicated private AI infrastructure for legal, healthcare, fintech, government, research, and more.',
    keywords: [
      'OpenClaw use cases',
      'OpenClaw industry solutions',
      'managed OpenClaw by city',
      'OpenClaw compliance hosting',
      'private OpenClaw deployment',
    ],
    path: '/solutions',
  });

  const industries = [...new Set(sortedSolutions.map((s) => s.industry))];

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
          <div className="sovereign-badge">Solutions Hub</div>
          <h1 className="hero-title">OpenClaw Solutions by Industry and City</h1>
          <p className="hero-subtitle">
            {sortedSolutions.length} focused pages covering regulated and high-confidentiality teams.
            Each page includes compliance context, local market framing, and FAQ schema.
          </p>
          <p className="solutions-meta">
            Industries covered: {industries.join(', ')}.
          </p>
        </section>

        <section className="solutions-grid" aria-label="All industry solution pages">
          {sortedSolutions.map((solution) => (
            <article key={solution.id} className="solution-link-card">
              <p className="solution-kicker">{solution.industry} • {solution.location}</p>
              <h2>
                <a href={`/solutions/${solution.id}`}>{solution.title}</a>
              </h2>
              <p>{solution.description}</p>
              <a className="solution-cta" href={`/solutions/${solution.id}`}>Read solution page</a>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
};
