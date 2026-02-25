import { Helmet } from 'react-helmet-async';
import { useState } from 'react';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Header } from '../components/ui/Header';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ChannelSetupModal } from '../components/ui/ChannelSetupModal';
import { InfoModal, type InfoModalType } from '../components/ui/InfoModal';
import {
  Check, X, Terminal, Zap,
  Server, ChevronDown, ArrowRight,
} from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import './LandingPage.css';
import './VsSelfHostingPage.css';

const SELF_HOSTING_STEPS = [
  { task: 'Create a cloud project & enable billing', time: '10 min' },
  { task: 'Provision a VM (pick region, machine type, disk)', time: '5 min' },
  { task: 'SSH in and install Docker + Docker Compose', time: '10 min' },
  { task: 'Clone the OpenClaw repo', time: '2 min' },
  { task: 'Configure .env, docker-compose.yml, API keys', time: '15 min' },
  { task: 'Build custom Docker image with baked binaries', time: '10 min' },
  { task: 'Set up SSH tunnels or Tailscale for access', time: '10 min' },
];

const ONGOING_MAINTENANCE = [
  { task: 'Fix Docker OOM crashes at 2am', icon: '💀' },
  { task: 'Run git pull → docker compose build → up on every update', icon: '🔄' },
  { task: 'Monitor disk usage and clean up old images', icon: '💾' },
  { task: 'Renew SSH keys and tunnel configs', icon: '🔑' },
  { task: 'Debug "pairing required" errors after restart', icon: '🐛' },
  { task: 'Upgrade machine type when you hit memory limits', icon: '📈' },
];

const FEATURES_KEPT = [
  'Multi-model routing (Claude, GPT, Gemini)',
  'All channels: Telegram, Discord, Slack',
  'Headless browser, code execution, web search',
  'Skills platform and ClawHub registry',
  'Voice Wake and Talk Mode',
  'Enterprise API tier — zero data training',
];

const FAQS = [
  {
    q: 'Is CloseClaw running the same OpenClaw?',
    a: 'Yes — we run the official, unmodified OpenClaw open-source core. Every feature available in self-hosted OpenClaw (headless browsing, multi-model reasoning, skills, voice) works identically on CloseClaw. We don\'t fork it, we just host it.',
  },
  {
    q: 'Can I migrate from my self-hosted setup to CloseClaw?',
    a: 'Yes. CloseClaw provisions a fresh OpenClaw instance. You just connect your Telegram/Discord/Slack bot token through our setup flow — the same tokens you used for self-hosting. Your API keys (OpenAI, Anthropic, Google) are configured through OpenClaw\'s standard config.',
  },
  {
    q: 'What about my API keys? Do they go through CloseClaw?',
    a: 'Your API keys are stored in your private VM\'s OpenClaw config — the same ~/.openclaw directory as self-hosting. API calls go directly from your VM to the model provider. CloseClaw never sees your API keys or your conversations.',
  },
  {
    q: 'How much does self-hosting actually cost?',
    a: 'A GCP e2-medium VM costs ~$24/month. Add your time: initial setup takes 60+ minutes, and ongoing maintenance averages 4.5 hours/week. CloseClaw starts at $50/month with $20 in AI credits included — and zero maintenance time.',
  },
  {
    q: 'Is my data actually private on CloseClaw?',
    a: 'Your OpenClaw instance runs on a dedicated VM with no public IP. Your conversations never pass through CloseClaw\'s servers. We use enterprise API tiers that guarantee your data is never used for model training. It\'s the same isolation you get from self-hosting, without the ops burden.',
  },
];

export const VsSelfHostingPage: React.FC = () => {
  const [setupChannel, setSetupChannel] = useState<'Telegram' | 'Discord' | 'Slack' | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModalType | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const seo = useSEO({
    title: 'OpenClaw: Self-Hosting vs Managed Hosting',
    description:
      'Compare self-hosting OpenClaw on Docker/GCP with CloseClaw managed hosting. Skip the 60-minute setup, Docker OOM crashes, and SSH tunnels — deploy in 60 seconds instead.',
    keywords: [
      'openclaw setup guide',
      'openclaw Docker setup',
      'openclaw VPS hosting',
      'openclaw deploy server',
      'openclaw Telegram bot setup',
      'openclaw always on',
      'openclaw GCP tutorial',
      'how to run openclaw 24/7',
      'openclaw self hosting alternative',
      'openclaw managed vs self hosted',
      'openclaw cloud deploy',
    ],
    path: '/vs-self-hosting',
  });

  const totalMinutes = SELF_HOSTING_STEPS.reduce((sum, s) => {
    const m = parseInt(s.time, 10);
    return sum + (isNaN(m) ? 0 : m);
  }, 0);

  return (
    <div className="landing-page vs-page">
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

      <main className="content-wrapper">
        {/* ─── Hero ─── */}
        <section className="hero-section vs-hero">
          <div className="hero-content">
            <div className="sovereign-badge">For OpenClaw users</div>
            <h1 className="hero-title">
              Self-Hosting vs <span className="text-gradient">Managed.</span>
            </h1>
            <p className="hero-subtitle">
              You already know OpenClaw is powerful. The question is whether you want to spend
              {' '}<strong>{totalMinutes}+ minutes</strong> setting it up on a VPS — and maintain
              it forever — or deploy in 60 seconds and never think about infrastructure again.
            </p>
          </div>
        </section>

        {/* ─── Side-by-Side Comparison ─── */}
        <section className="comparison-section">
          <div className="comparison-badge">The difference</div>
          <h2 className="comparison-title">Setup: Step by Step</h2>

          <div className="comparison-grid">
            <div className="comparison-left">
              <h4 className="method-label">Self-Hosting (Docker / GCP / VPS)</h4>
              <ul className="effort-list">
                {SELF_HOSTING_STEPS.map((step, i) => (
                  <li key={i}>
                    <span>{step.task}</span>
                    <span className="time">{step.time}</span>
                  </li>
                ))}
              </ul>
              <div className="total-effort">
                <span className="total-label">Initial setup</span>
                <span className="total-value">{totalMinutes}+ min</span>
              </div>
              <p className="non-technical-hint">+ ongoing maintenance forever</p>
            </div>

            <div className="comparison-divider"></div>

            <div className="comparison-right">
              <h4 className="method-label">With CloseClaw</h4>
              <div className="instant-badge">60s</div>
              <p className="instant-desc">
                Pick your channel, paste your bot token, and you're live. CloseClaw provisions a
                dedicated VM, installs OpenClaw, connects your channel, and handles uptime — all
                in under a minute. No Docker, no SSH, no config files.
              </p>
              <div className="instant-features">
                <div className="i-feature"><Check size={16} /> 99.9% Uptime SLA</div>
                <div className="i-feature"><Check size={16} /> 100% Isolated VM</div>
                <div className="i-feature"><Check size={16} /> Zero maintenance</div>
                <div className="i-feature"><Check size={16} /> Auto-updates</div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── What You Skip ─── */}
        <section className="vs-skip-section">
          <header className="section-header">
            <h2>What You Never Have to Do Again</h2>
            <p>Every one of these is a real pain point from the OpenClaw GCP/Docker setup guide.</p>
          </header>
          <div className="vs-skip-grid">
            {ONGOING_MAINTENANCE.map((item, i) => (
              <Card key={i} className="vs-skip-card" hoverable>
                <div className="vs-skip-icon">{item.icon}</div>
                <p>{item.task}</p>
                <X size={16} className="vs-skip-x" />
              </Card>
            ))}
          </div>
        </section>

        {/* ─── What You Keep ─── */}
        <section className="vs-keep-section">
          <header className="section-header">
            <h2>What Stays Exactly the Same</h2>
            <p>CloseClaw runs the official, unmodified OpenClaw core. Every feature works.</p>
          </header>
          <div className="vs-keep-grid">
            {FEATURES_KEPT.map((feature, i) => (
              <div key={i} className="vs-keep-item">
                <Check size={18} className="vs-keep-check" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Cost Comparison ─── */}
        <section className="vs-cost-section">
          <header className="section-header">
            <h2>Cost Comparison</h2>
          </header>
          <div className="vs-cost-grid">
            <Card className="vs-cost-card" hoverable>
              <Server size={24} className="vs-cost-icon muted" />
              <h3>Self-Hosting</h3>
              <div className="vs-cost-price">~$24<span>/mo</span></div>
              <p className="vs-cost-note">GCP e2-medium VM only</p>
              <ul className="vs-cost-list">
                <li><X size={14} /> Your time: setup + maintenance</li>
                <li><X size={14} /> No uptime guarantee</li>
                <li><X size={14} /> You handle updates</li>
                <li><X size={14} /> You debug crashes</li>
              </ul>
            </Card>
            <Card className="vs-cost-card featured" hoverable>
              <Zap size={24} className="vs-cost-icon accent" />
              <h3>CloseClaw Base</h3>
              <div className="vs-cost-price">$50<span>/mo</span></div>
              <p className="vs-cost-note">Includes $20 in AI credits</p>
              <ul className="vs-cost-list">
                <li><Check size={14} /> Zero setup time</li>
                <li><Check size={14} /> 99.9% uptime SLA</li>
                <li><Check size={14} /> Auto-updates</li>
                <li><Check size={14} /> We debug everything</li>
              </ul>
              <Button
                className="vs-cta-btn"
                variant="primary"
                onClick={() => setSetupChannel('Telegram')}
              >
                Deploy Now <ArrowRight size={16} />
              </Button>
            </Card>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="solution-faq-section">
          <header className="section-header">
            <h2>Frequently Asked Questions</h2>
          </header>
          <div className="faq-list">
            {FAQS.map((faq, index) => (
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
        <ChannelSetupModal channel={setupChannel} onClose={() => setSetupChannel(null)} />
      )}
      {infoModal && (
        <InfoModal type={infoModal} onClose={() => setInfoModal(null)} />
      )}
    </div>
  );
};
