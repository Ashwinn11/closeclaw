import { useState } from 'react';
import './LandingPage.css';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { IconCluster } from '../components/ui/IconCluster';
import { Header } from '../components/ui/Header';
import { BrandIcons } from '../components/ui/BrandIcons';
import { ChannelSetupModal } from '../components/ui/ChannelSetupModal';
import { InfoModal, type InfoModalType } from '../components/ui/InfoModal';
import { Check, Terminal, Globe } from 'lucide-react';

type ChannelType = 'Telegram' | 'Discord' | 'Slack';

export const LandingPage: React.FC = () => {
  const [setupChannel, setSetupChannel] = useState<ChannelType | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModalType | null>(null);

  return (
    <div className="landing-page">
      <NebulaBackground />
      <Header />

      <main className="content-wrapper">
        {/* Hero Section */}
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-content">
            <div className="sovereign-badge">Ready in 60 seconds</div>
            <h1 id="hero-title" className="hero-title">
              Your own AI assistant. <br />
              <span className="text-gradient">Private, dedicated, always on.</span>
            </h1>
            <p className="hero-subtitle">
              A dedicated AI running on your own private server —<br />
              ready on Telegram, Discord, or Slack. No sharing, no setup.
            </p>
            
            <nav className="channel-buttons" aria-label="Messaging channel selection">
              <Button 
                  className="channel-btn telegram"
                  onClick={() => setSetupChannel('Telegram')}
                  aria-label="Set up private AI on Telegram"
              >
                <div className="btn-icon" aria-hidden="true"><BrandIcons.Telegram /></div>
                <span>Telegram</span>
              </Button>
              
              <Button 
                  className="channel-btn discord"
                  onClick={() => setSetupChannel('Discord')}
                  aria-label="Set up private AI on Discord"
              >
                <div className="btn-icon" aria-hidden="true"><BrandIcons.Discord /></div>
                <span>Discord</span>
              </Button>
              
              <Button 
                  className="channel-btn slack"
                  onClick={() => setSetupChannel('Slack')}
                  aria-label="Set up private AI on Slack"
              >
                <div className="btn-icon" aria-hidden="true"><BrandIcons.Slack /></div>
                <span>Slack</span>
              </Button>
            </nav>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <IconCluster />
          </div>
        </section>

        {/* Comparison Section */}
        <section className="comparison-section" aria-labelledby="comparison-title">
          <div className="comparison-badge">The difference</div>
          <h2 id="comparison-title" className="comparison-title">Why CloseClaw?</h2>

          <div className="comparison-grid">
            <article className="comparison-left">
              <h4 className="method-label">Running it yourself</h4>
              <ul className="effort-list">
                <li><span>Renting and configuring a cloud server</span> <span className="time">20 min</span></li>
                <li><span>Setting up firewalls and security</span> <span className="time">15 min</span></li>
                <li><span>Wiring up Telegram, Discord, Slack</span> <span className="time">30 min</span></li>
                <li><span>Fixing it when it goes down at 2am</span> <span className="time">???</span></li>
                <li><span>Keeping everything up to date</span> <span className="time">∞</span></li>
              </ul>
              <div className="total-effort">
                <span className="total-label">Total effort</span>
                <span className="total-value">Never done</span>
              </div>
            </article>

            <div className="comparison-divider" aria-hidden="true"></div>

            <article className="comparison-right">
              <h4 className="method-label">With CloseClaw</h4>
              <div className="instant-badge">All handled</div>
              <p className="instant-desc">
                Your AI gets its own private server. We handle everything —
                setup, uptime, updates, and security. You just talk to it.
              </p>
              <div className="instant-features">
                <div className="i-feature"><Check size={16} aria-hidden="true" /> Always online</div>
                <div className="i-feature"><Check size={16} aria-hidden="true" /> Completely private</div>
                <div className="i-feature"><Check size={16} aria-hidden="true" /> Zero maintenance</div>
              </div>
            </article>
          </div>
        </section>

        {/* Features Section - Simple & Secure */}
        <section id="features" className="features-section" aria-labelledby="features-title">
          <header className="section-header">
             <h2 id="features-title">Your AI. Your server. Your rules.</h2>
             <p>We handle the hard parts so you get a private, always-on AI without any of the maintenance.</p>
          </header>

          <div className="bento-grid">
            <Card className="bento-card card-cost" hoverable>
              <article className="card-content">
                <header className="card-header">
                  <div className="status-badge"><span className="dot green"></span>Optimized</div>
                  <h3>Costs less than you think</h3>
                </header>
                <div className="visual-cost" aria-hidden="true">
                   <div className="cost-bar high">
                      <span>Standard</span>
                      <div className="bar-fill red"></div>
                   </div>
                   <div className="cost-bar low">
                      <span>CloseClaw</span>
                      <div className="bar-fill green"></div>
                      <div className="savings-badge">Save 80%</div>
                   </div>
                </div>
                <p>Smart model routing picks the fastest, cheapest AI for each task. Most users spend a fraction of what they'd pay going direct.</p>
              </article>
            </Card>

            <Card className="bento-card card-routing" hoverable>
              <article>
                <div className="visual-hex-grid" aria-hidden="true">
                   <div className="hex opacity-30"><BrandIcons.OpenAI /></div>
                   <div className="hex active"><BrandIcons.Anthropic /></div>
                   <div className="hex opacity-30"><BrandIcons.Gemini /></div>
                </div>
                <h3>Picks the right AI automatically</h3>
                <p>GPT, Claude, Gemini — your assistant chooses the best model for each job. Writing, coding, research, planning. No settings needed.</p>
              </article>
            </Card>

            <Card className="bento-card card-security" hoverable>
              <article className="card-content horizontal">
                <div className="text-content">
                  <h3>Isolated and private by design</h3>
                  <p>Your AI runs on a dedicated server with no public IP. It's never shared with other users. Your conversations stay yours.</p>
                </div>
                <div className="visual-shield" aria-hidden="true">
                   <div className="network-nodes">
                     <div className="node center"></div>
                     <div className="node pulse-1"></div>
                     <div className="node pulse-2"></div>
                   </div>
                </div>
              </article>
            </Card>

            <Card className="bento-card card-browser" hoverable>
               <article>
                <div className="visual-ephemeral" aria-hidden="true">
                  <div className="orbital-ring"></div>
                  <BrandIcons.Chromium />
                </div>
                <h3>Browses the web for you</h3>
                <p>Your AI can open websites, read pages, and research topics on your behalf — all from your private server, no tracking involved.</p>
               </article>
            </Card>

            <Card className="bento-card card-global" hoverable>
              <article className="card-content">
                <div className="visual-global" aria-hidden="true">
                   <Globe className="globe-icon" size={48} />
                   <div className="region-dots">
                      <div className="dot us" title="US Regions"></div>
                      <div className="dot eu" title="Europe Regions"></div>
                      <div className="dot as" title="Asia Regions"></div>
                   </div>
                </div>
                <h3>Global Availability</h3>
                <p>Deploy your private AI instance in Google Cloud regions across the US, Europe, and Asia for low-latency access worldwide.</p>
              </article>
            </Card>
          </div>
        </section>
      </main>

        {/* Unified Glass Footer */}
        <footer className="footer-container">
           <div className="glass-footer">
              <div className="footer-brand-col">
                 <div className="footer-logo">
                    <img src="/logo.png" alt="CloseClaw Logo - Private AI Assistant" className="logo-icon small" />
                    CloseClaw
                 </div>
                 <div className="powered-badge">
                   <Terminal size={12} aria-hidden="true" /> Powered by OpenClaw
                 </div>
                 <div className="copyright">© 2026 CloseClaw</div>
              </div>

              <nav className="footer-links-col" aria-label="Product links">
                 <h4>Product</h4>
                 <a href="#features">Features</a>
                 <a href="#features">Use Cases</a>
                 <a href="#features">Pricing</a>
              </nav>

              <nav className="footer-links-col" aria-label="Resource links">
                 <h4>Resources</h4>
                 <a href="https://docs.openclaw.ai" target="_blank" rel="noopener noreferrer">OpenClaw Docs</a>
                 <a href="#">Discord</a>
                 <a href="#">Status</a>
              </nav>

              <nav className="footer-links-col" aria-label="Company links">
                 <h4>Company</h4>
                 <button className="footer-link-btn" onClick={() => setInfoModal('about')}>About</button>
                 <a href="mailto:support@closeclaw.in">Contact</a>
                 <button className="footer-link-btn" onClick={() => setInfoModal('tos')}>Terms of Service</button>
                 <button className="footer-link-btn" onClick={() => setInfoModal('privacy')}>Privacy Policy</button>
              </nav>
           </div>
        </footer>

      {/* Channel Setup Modal (Token → Verify → Billing) */}
      {setupChannel && (
        <ChannelSetupModal
          channel={setupChannel}
          onClose={() => setSetupChannel(null)}
        />
      )}

      {/* Info Modals: About / ToS / Privacy */}
      {infoModal && (
        <InfoModal type={infoModal} onClose={() => setInfoModal(null)} />
      )}
    </div>
  );
};
