import { useState } from 'react';
import './LandingPage.css';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { IconCluster } from '../components/ui/IconCluster';
import { Header } from '../components/ui/Header';
import { BrandIcons } from '../components/ui/BrandIcons';
import { ChannelSetupModal } from '../components/ui/ChannelSetupModal';
import { Check, Terminal } from 'lucide-react';

type ChannelType = 'Telegram' | 'Discord' | 'Slack';

export const LandingPage: React.FC = () => {
  const [setupChannel, setSetupChannel] = useState<ChannelType | null>(null);

  return (
    <div className="landing-page">
      <NebulaBackground />
      <Header />

      <main className="content-wrapper">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="sovereign-badge">Ready in 60 seconds</div>
            <h1 className="hero-title">
              Your personal AI, <br />
              <span className="text-gradient">on the apps you use every day.</span>
            </h1>
            <p className="hero-subtitle">
              Talk to your own AI assistant on Telegram, Discord, or Slack.<br />
              No servers. No setup. No technical knowledge needed.
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
              <h4 className="method-label">Doing it yourself</h4>
              <ul className="effort-list">
                <li><span>Renting and setting up cloud servers</span> <span className="time">20 min</span></li>
                <li><span>Configuring firewalls and security</span> <span className="time">15 min</span></li>
                <li><span>Managing IP addresses</span> <span className="time">10 min</span></li>
                <li><span>Watching for crashes and downtime</span> <span className="time">10 min</span></li>
                <li><span>Applying updates and patches</span> <span className="time">∞</span></li>
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
                We take care of everything behind the scenes. Your AI runs on a dedicated
                server that's always on, always private, and always up to date.
              </p>
              <div className="instant-features">
                <div className="i-feature"><Check size={16} /> Always online</div>
                <div className="i-feature"><Check size={16} /> Completely private</div>
                <div className="i-feature"><Check size={16} /> Auto-recovery</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section - Simple & Secure */}
        <section id="features" className="features-section">
          <div className="section-header">
             <h2>Everything handled. Nothing to set up.</h2>
             <p>We run the infrastructure so you can focus on what matters — talking to your AI.</p>
          </div>
          
          <div className="bento-grid">
            <Card className="bento-card card-cost" hoverable>
              <div className="card-content">
                <div className="card-header">
                  <div className="status-badge"><span className="dot green"></span>Optimized</div>
                  <h3>Lower costs, automatically</h3>
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
                <p>We optimize how your AI thinks so you get more done for less. Most users save up to 80% compared to using AI directly.</p>
              </div>
            </Card>

            <Card className="bento-card card-routing" hoverable>
              <div className="visual-hex-grid">
                 <div className="hex opacity-30"><BrandIcons.OpenAI /></div>
                 <div className="hex active"><BrandIcons.Anthropic /></div>
                 <div className="hex opacity-30"><BrandIcons.Gemini /></div>
              </div>
              <h3>Always uses the best AI</h3>
              <p>Your assistant automatically picks the right AI model for each task — writing, coding, research, planning. No settings to tweak.</p>
            </Card>

            <Card className="bento-card card-security" hoverable>
              <div className="card-content horizontal">
                <div className="text-content">
                  <h3>Completely private</h3>
                  <p>Your AI runs on a server that's never exposed to the public internet. Your conversations belong to you alone.</p>
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
               <p>Your AI can search and read websites on your behalf — privately, with no tracking or data collection involved.</p>
            </Card>
          </div>
        </section>



      </main>

        {/* Unified Glass Footer */}
        <footer className="footer-container">
           <div className="glass-footer">
              <div className="footer-brand-col">
                 <div className="footer-logo">
                    <div className="logo-icon small"></div>
                    CloseClaw
                 </div>
                 <div className="powered-badge">
                   <Terminal size={12} /> Powered by OpenClaw
                 </div>
                 <div className="copyright">© 2026 CloseClaw</div>
              </div>

              <div className="footer-links-col">
                 <h4>Product</h4>
                 <a href="#">Features</a>
                 <a href="#">Use Cases</a>
                 <a href="#">Pricing</a>
              </div>

              <div className="footer-links-col">
                 <h4>Resources</h4>
                 <a href="#">OpenClaw Docs</a>
                 <a href="#">Discord</a>
                 <a href="#">Status</a>
              </div>

              <div className="footer-links-col">
                 <h4>Company</h4>
                 <a href="#">About</a>
                 <a href="#">Contact</a>
                 <a href="#">Terms of Service</a>
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
    </div>
  );
};


