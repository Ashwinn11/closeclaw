import { useParams, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import solutions from '../data/pseo-solutions.json';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Header } from '../components/ui/Header';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { BrandIcons } from '../components/ui/BrandIcons';
import {
  Terminal, Shield, Zap, Lock, Scale,
  MapPin, BarChart3, BookOpen, MessageCircle, ChevronDown,
} from 'lucide-react';
import './LandingPage.css'; // Reuse existing styles
import './SolutionPage.css';
import { useState } from 'react';
import { ChannelSetupModal } from '../components/ui/ChannelSetupModal';
import { InfoModal, type InfoModalType } from '../components/ui/InfoModal';
import { useSEO } from '../hooks/useSEO';

export const SolutionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [setupChannel, setSetupChannel] = useState<'Telegram' | 'Discord' | 'Slack' | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModalType | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const solution = solutions.find((s) => s.id === id);

  const seo = useSEO(
    solution
      ? {
          title: solution.title,
          description: solution.description,
          keywords: solution.keywords,
          path: `/solutions/${solution.id}`,
          industry: solution.industry,
          location: solution.location,
          industryFaqs: solution.industry_faqs,
        }
      : { title: 'CloseClaw', description: '', path: '/' },
  );

  if (!solution) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="landing-page solution-page">
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
        {seo.faqSchema && (
          <script type="application/ld+json">{JSON.stringify(seo.faqSchema)}</script>
        )}
        {seo.serviceSchema && (
          <script type="application/ld+json">{JSON.stringify(seo.serviceSchema)}</script>
        )}
      </Helmet>
      <NebulaBackground />
      <Header />

      <main className="content-wrapper">
        {/* ─── Hero Section ─── */}
        <article className="hero-section">
          <div className="hero-content">
            <div className="sovereign-badge">{solution.industry} AI Solutions — {solution.location}</div>
            <h1 className="hero-title">
              {solution.hero_title}
            </h1>
            <p className="hero-subtitle">
              {solution.hero_subtitle}
            </p>
            
            <nav className="channel-buttons">
              <Button className="channel-btn telegram" onClick={() => setSetupChannel('Telegram')}>
                <div className="btn-icon"><BrandIcons.Telegram /></div>
                <span>Telegram</span>
              </Button>
              <Button className="channel-btn discord" onClick={() => setSetupChannel('Discord')}>
                <div className="btn-icon"><BrandIcons.Discord /></div>
                <span>Discord</span>
              </Button>
            </nav>
          </div>
        </article>

        {/* ─── Key Stats Bar ─── */}
        <section className="solution-stats-bar" aria-label="Industry statistics">
          <div className="stat-card">
            <BarChart3 size={20} className="icon-accent" />
            <span className="stat-value">{solution.stat_1.value}</span>
            <span className="stat-label">{solution.stat_1.label}</span>
            <cite className="stat-source">{solution.stat_1.source}</cite>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-card">
            <BarChart3 size={20} className="icon-accent" />
            <span className="stat-value">{solution.stat_2.value}</span>
            <span className="stat-label">{solution.stat_2.label}</span>
            <cite className="stat-source">{solution.stat_2.source}</cite>
          </div>
        </section>

        {/* ─── Problem & Solution ─── */}
        <section className="solution-problem-section">
          <header className="section-header">
            <h2>The Challenge for {solution.industry} Teams in {solution.location}</h2>
          </header>
          <div className="problem-solution-grid">
            <Card className="problem-card" hoverable>
              <article>
                <div className="ps-label">The Problem</div>
                <p>{solution.pain_point}</p>
              </article>
            </Card>
            <Card className="solution-card" hoverable>
              <article>
                <div className="ps-label accent">The Solution</div>
                <p>{solution.solution}</p>
              </article>
            </Card>
          </div>
        </section>

        {/* ─── Compliance Detail ─── */}
        <section className="solution-compliance-section">
          <header className="section-header">
            <Scale size={24} className="icon-accent" />
            <h2>Regulatory Compliance: {solution.regulation_name}</h2>
          </header>
          <div className="compliance-content">
            <p>{solution.compliance_detail}</p>
          </div>
        </section>

        {/* ─── Local Context ─── */}
        <section className="solution-local-section">
          <header className="section-header">
            <MapPin size={24} className="icon-accent" />
            <h2>Why {solution.location}?</h2>
          </header>
          <div className="local-content">
            <p>{solution.local_context}</p>
          </div>
        </section>

        {/* ─── Workflow Example ─── */}
        <section className="solution-workflow-section">
          <header className="section-header">
            <BookOpen size={24} className="icon-accent" />
            <h2>Real-World Workflow</h2>
          </header>
          <Card className="workflow-card" hoverable>
            <blockquote>
              <p>{solution.workflow_example}</p>
            </blockquote>
          </Card>
        </section>

        {/* ─── Infrastructure Features ─── */}
        <section className="features-section">
          <header className="section-header">
             <h2>Why {solution.industry} teams in {solution.location} trust CloseClaw</h2>
             <p>Enterprise-grade infrastructure designed for regulated industries that demand absolute data isolation.</p>
          </header>

          <div className="bento-grid">
            <Card className="bento-card" hoverable>
              <article>
                <Shield size={24} className="icon-accent" />
                <h3>Isolated Infrastructure</h3>
                <p>Your AI instance runs on a dedicated server with no public IP address. It's completely isolated from other users — satisfying the strictest data sovereignty requirements in {solution.location}.</p>
              </article>
            </Card>
            <Card className="bento-card" hoverable>
              <Lock size={24} className="icon-accent" />
              <h3>Zero Data Training</h3>
              <p>We use enterprise APIs that guarantee your data is never used to train future AI models. What you say stays on your server — critical for {solution.industry} professionals handling confidential information.</p>
            </Card>
            <Card className="bento-card" hoverable>
              <Zap size={24} className="icon-accent" />
              <h3>Instant Deployment</h3>
              <p>Get a private, production-ready AI server for your {solution.industry} workflows in {solution.location} in less than 60 seconds. No engineering team needed.</p>
            </Card>
          </div>
        </section>

        {/* ─── Industry FAQs ─── */}
        {solution.industry_faqs && solution.industry_faqs.length > 0 && (
          <section className="solution-faq-section">
            <header className="section-header">
              <MessageCircle size={24} className="icon-accent" />
              <h2>Frequently Asked Questions: {solution.industry} in {solution.location}</h2>
            </header>
            <div className="faq-list">
              {solution.industry_faqs.map((faq, index) => (
                <div
                  key={index}
                  className={`faq-item ${openFaq === index ? 'open' : ''}`}
                >
                  <button
                    className="faq-question"
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    aria-expanded={openFaq === index}
                  >
                    <span>{faq.q}</span>
                    <ChevronDown size={20} className="faq-chevron" />
                  </button>
                  <div className="faq-answer">
                    <p>{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="footer-container">
           <div className="glass-footer">
              <div className="footer-brand-col">
                 <div className="footer-logo">
                    <img src="/logo.png" alt="CloseClaw Logo" className="logo-icon small" />
                    CloseClaw
                 </div>
                 <div className="powered-badge">
                   <Terminal size={12} /> Powered by OpenClaw
                 </div>
                 <div className="copyright">© 2026 CloseClaw</div>
              </div>
              <div className="footer-links-col">
                 <h4>Legal</h4>
                 <button className="footer-link-btn" onClick={() => setInfoModal('tos')}>Terms of Service</button>
                 <button className="footer-link-btn" onClick={() => setInfoModal('privacy')}>Privacy Policy</button>
              </div>
           </div>
      </footer>

      {setupChannel && (
        <ChannelSetupModal
          channel={setupChannel}
          onClose={() => setSetupChannel(null)}
        />
      )}
      {infoModal && (
        <InfoModal type={infoModal} onClose={() => setInfoModal(null)} />
      )}
    </div>
  );
};
