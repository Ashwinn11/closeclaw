import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createCheckout } from '../lib/api';
import './LandingPage.css';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { IconCluster } from '../components/ui/IconCluster';
import { Header } from '../components/ui/Header';
import { BrandIcons } from '../components/ui/BrandIcons';
import { ChannelSetupModal } from '../components/ui/ChannelSetupModal';
import { InfoModal, type InfoModalType } from '../components/ui/InfoModal';
import { LoginModal } from '../components/ui/LoginModal';
import { Check, Terminal } from 'lucide-react';

type ChannelType = 'Telegram' | 'Discord' | 'Slack';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [setupChannel, setSetupChannel] = useState<ChannelType | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModalType | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleGetStarted = async (planName: string = 'Guardian') => {
    if (isAuthenticated) {
      try {
        const { checkoutUrl } = await createCheckout(planName);
        window.location.href = checkoutUrl;
      } catch (err) {
        console.error('Failed to create checkout:', err);
        navigate('/billing'); // Fallback to billing page if checkout creation fails
      }
    } else {
      setShowLoginModal(true);
    }
  };

  return (
    <div className="landing-page">
      <NebulaBackground />
      <Header />

      <main className="content-wrapper">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="sovereign-badge">Deployed in 60 seconds</div>
            <h1 className="hero-title">
              Managed OpenClaw Hosting. <br />
              <span className="text-gradient">Your dedicated AI infrastructure.</span>
            </h1>
            <p className="hero-subtitle">
              The simplest way to deploy your own powerful OpenClaw agent on a private server —<br />
              ready on Telegram, Discord, or Slack. Complete control, zero technical overhead.
            </p>
            
            <div className="channel-buttons">
              <Button 
                  className="channel-btn telegram"
                  onClick={() => setSetupChannel('Telegram')}
              >
                <div className="btn-icon"><BrandIcons.Telegram /></div>
                <span>Telegram</span>
              </Button>
              
              <Button 
                  className="channel-btn discord"
                  onClick={() => setSetupChannel('Discord')}
              >
                <div className="btn-icon"><BrandIcons.Discord /></div>
                <span>Discord</span>
              </Button>
              
              <Button 
                  className="channel-btn slack"
                  onClick={() => setSetupChannel('Slack')}
              >
                <div className="btn-icon"><BrandIcons.Slack /></div>
                <span>Slack</span>
              </Button>
            </div>
          </div>

          <div className="hero-visual">
            <IconCluster />
          </div>
        </section>

        {/* Comparison Section */}
        <section className="comparison-section">
          <div className="comparison-badge">The difference</div>
          <h2 className="comparison-title">Why CloseClaw?</h2>

          <div className="comparison-grid">
            <div className="comparison-left">
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
            </div>

            <div className="comparison-divider"></div>

            <div className="comparison-right">
              <h4 className="method-label">With CloseClaw</h4>
              <div className="instant-badge">All handled</div>
              <p className="instant-desc">
                Your OpenClaw instance gets its own private server instantly. According to our hosting benchmarks, we save teams an average of 4.5 hours per week in server management. We handle everything —
                setup, 99.9% uptime guarantees, updates, and military-grade security isolation. You just talk to your agent.
              </p>
              <div className="instant-features">
                <div className="i-feature"><Check size={16} /> 99.9% Uptime SLA</div>
                <div className="i-feature"><Check size={16} /> 100% Isolated VMs</div>
                <div className="i-feature"><Check size={16} /> Zero maintenance</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section - Simple & Secure */}
        <section id="features" className="features-section">
          <div className="section-header">
             <h2>Your Agent. Your instance. Your rules.</h2>
             <p>We handle the infrastructure so you get a robust, always-on OpenClaw agent without any of the maintenance.</p>
          </div>

          <div className="bento-grid">
            <Card className="bento-card card-cost" hoverable>
              <div className="card-content">
                <div className="card-header">
                  <div className="status-badge"><span className="dot green"></span>Optimized</div>
                  <h3>Costs less than you think</h3>
                </div>
                <div className="visual-cost">
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
                <p>Smart model routing automatically selects the optimal AI for each task. Market research shows most teams spend $3,500+ building custom integrations, but our infrastructure delivers a 98% savings in initial setup costs while maintaining enterprise reliability.</p>
              </div>
            </Card>

            <Card className="bento-card card-routing" hoverable>
              <div className="visual-hex-grid">
                 <div className="hex opacity-30"><BrandIcons.OpenAI /></div>
                 <div className="hex active"><BrandIcons.Anthropic /></div>
                 <div className="hex opacity-30"><BrandIcons.Gemini /></div>
              </div>
              <h3>Picks the right model automatically</h3>
              <p>GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro — OpenClaw analyzes intent and dynamically routes prompts, reducing token latency by up to 40%. Perfect for writing, coding, or complex research pipelines. No settings needed.</p>
            </Card>

            <Card className="bento-card card-security" hoverable>
              <div className="card-content horizontal">
                <div className="text-content">
                  <h3>Isolated and private by design</h3>
                  <p>Security experts note that dedicated VMs are the only way to ensure 100% network isolation. Your instance runs on a dedicated server with no public IP, meaning zero data sharing with other tenants. Your conversations are cryptographically secure.</p>
                </div>
                <div className="visual-shield">
                   <div className="network-nodes">
                     <div className="node center"></div>
                     <div className="node pulse-1"></div>
                     <div className="node pulse-2"></div>
                   </div>
                </div>
              </div>
            </Card>

            <Card className="bento-card card-browser" hoverable>
               <div className="visual-ephemeral">
                 <div className="orbital-ring"></div>
                 <BrandIcons.Chromium />
               </div>
               <h3>Browses the web for you</h3>
               <p>OpenClaw utilizes headless browser infrastructure to open websites, scrape pages, and synthesize research up to 5x faster than manual browsing — all from your private server, ensuring zero third-party tracking.</p>
            </Card>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="pricing-section">
          <div className="section-header">
            <h2>Simple, transparent pricing</h2>
            <p>Choose the scale that fits your workflow. Billed monthly, cancel anytime.</p>
          </div>

          <div className="pricing-grid">
            <Card className="pricing-card" hoverable>
              <div className="pc-content">
                <div className="pc-header">
                  <h3>Base</h3>
                  <div className="pc-price">$50<span>/mo</span></div>
                  <p className="pc-tagline">Light & always on</p>
                </div>
                <ul className="pc-features">
                  <li><Check size={16} /> Dedicated AI on Telegram, Discord & Slack</li>
                  <li><Check size={16} /> $20 in AI credits/mo included</li>
                  <li><Check size={16} /> Your own private server, never shared</li>
                  <li><Check size={16} /> 99.9% Uptime SLA</li>
                </ul>
                <Button className="pc-btn" variant="secondary" onClick={() => handleGetStarted('Base')}>Get Started</Button>
              </div>
            </Card>

            <Card className="pricing-card popular" hoverable>
              <div className="popular-badge">Most Popular</div>
              <div className="pc-content">
                <div className="pc-header">
                  <h3>Guardian</h3>
                  <div className="pc-price">$75<span>/mo</span></div>
                  <p className="pc-tagline">For daily productivity</p>
                </div>
                <ul className="pc-features">
                  <li><Check size={16} /> <strong>Everything in Base</strong></li>
                  <li><Check size={16} /> $35 in AI credits/mo included</li>
                  <li><Check size={16} /> Best for heavy daily use</li>
                  <li><Check size={16} /> Multi-step tasks & deep research</li>
                </ul>
                <Button className="pc-btn" variant="primary" onClick={() => handleGetStarted('Guardian')}>Get Started</Button>
              </div>
            </Card>

            <Card className="pricing-card" hoverable>
              <div className="pc-content">
                <div className="pc-header">
                  <h3>Fortress</h3>
                  <div className="pc-price">$100<span>/mo</span></div>
                  <p className="pc-tagline">For power users</p>
                </div>
                <ul className="pc-features">
                  <li><Check size={16} /> <strong>Everything in Guardian</strong></li>
                  <li><Check size={16} /> $50 in AI credits/mo included</li>
                  <li><Check size={16} /> Built for automation & long sessions</li>
                  <li><Check size={16} /> Priority infrastructure scaling</li>
                </ul>
                <Button className="pc-btn" variant="secondary" onClick={() => handleGetStarted('Fortress')}>Get Started</Button>
              </div>
            </Card>
          </div>

          <div className="topup-intro">
            <h3>Need more? Top up credits anytime.</h3>
            <p>If you run through your monthly allowance, you can add more credits instantly.</p>
            <div className="topup-packs">
              <div className="topup-pack"><span>$5 Pack</span></div>
              <div className="topup-pack"><span>$10 Pack</span></div>
              <div className="topup-pack"><span>$25 Pack</span></div>
              <div className="topup-pack"><span>$50 Pack</span></div>
              <div className="topup-pack"><span>$100 Pack</span></div>
            </div>
          </div>
        </section>
      </main>

        {/* Unified Glass Footer */}
        <footer className="footer-container">
           <div className="glass-footer">
              <div className="footer-brand-col">
                 <div className="footer-logo">
                    <img src="/logo.png" alt="CloseClaw" className="logo-icon small" />
                    CloseClaw
                 </div>
                 <div className="powered-badge">
                   <Terminal size={12} /> Powered by OpenClaw
                 </div>
                 <div className="copyright">© 2026 CloseClaw</div>
                 <Button className="footer-get-started" size="sm" onClick={() => handleGetStarted()}>Get Started Now</Button>
              </div>

              <div className="footer-links-col">
                 <h4>Product</h4>
                 <a href="#features">Features</a>
                 <a href="#features">Use Cases</a>
                 <a href="#pricing">Pricing</a>
              </div>

              <div className="footer-links-col">
                 <h4>Resources</h4>
                 <a href="https://docs.openclaw.ai" target="_blank" rel="noopener noreferrer">OpenClaw Docs</a>
                 <a href="https://discord.gg/closeclaw" target="_blank" rel="noopener noreferrer">Discord</a>
                 <a href="https://status.closeclaw.in">Status</a>
              </div>

              <div className="footer-links-col">
                 <h4>Company</h4>
                 <button className="footer-link-btn" onClick={() => setInfoModal('about')}>About</button>
                 <a href="mailto:support@closeclaw.in">Contact</a>
                 <button className="footer-link-btn" onClick={() => setInfoModal('tos')}>Terms of Service</button>
                 <button className="footer-link-btn" onClick={() => setInfoModal('privacy')}>Privacy Policy</button>
                 <button className="footer-link-btn" onClick={() => setInfoModal('refund')}>Refund Policy</button>
              </div>
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

      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );
};


