import React, { useState } from 'react';
import './LandingPage.css';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { IconCluster } from '../components/ui/IconCluster';
import { Header } from '../components/ui/Header';
import { BrandIcons } from '../components/ui/BrandIcons';
import { Check, Terminal } from 'lucide-react';

export const LandingPage: React.FC = () => {
  const [showBilling, setShowBilling] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  const handleChannelClick = (channel: string) => {
    setSelectedChannel(channel);
    setShowBilling(true);
  };

  const handlePlanSelect = (plan: string) => {
    console.log(`Selected plan: ${plan} for channel: ${selectedChannel}`);
    alert(`Mock Checkout: Successfully subscribed to ${plan} plan for ${selectedChannel}!`);
    setShowBilling(false);
    setSelectedChannel(null);
  };

  return (
    <div className="landing-page">
      <NebulaBackground />
      <Header />

      <main className="content-wrapper">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="sovereign-badge">Sovereign Layer 01</div>
            <h1 className="hero-title">
              Your Agent Already Knows <br />
              <span className="text-gradient">all your favorite apps.</span>
            </h1>
            <p className="hero-subtitle">
              Connect to 50+ integrations instantly—Telegram, Slack, Notion, GitHub and more.<br />
              Secure, private, and ready in under 60 seconds.
            </p>
            
            <div className="channel-buttons">
              <Button 
                  className="channel-btn telegram"
                  onClick={() => handleChannelClick('Telegram')}
              >
                <div className="btn-icon"><BrandIcons.Telegram /></div>
                <span>Telegram</span>
              </Button>
              
              <Button 
                  className="channel-btn discord"
                  onClick={() => handleChannelClick('Discord')}
              >
                <div className="btn-icon"><BrandIcons.Discord /></div>
                <span>Discord</span>
              </Button>
              
              <Button 
                  className="channel-btn slack"
                  onClick={() => handleChannelClick('Slack')}
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
          <div className="comparison-badge">Efficiency</div>
          <h2 className="comparison-title">Why use CloseClaw?</h2>
          
          <div className="comparison-grid">
            <div className="comparison-left">
              <h4 className="method-label">Traditional Setup</h4>
              <ul className="effort-list">
                <li><span>Provisioning Cloud Servers</span> <span className="time">20 min</span></li>
                <li><span>Securing Gateways & Ports</span> <span className="time">15 min</span></li>
                <li><span>Managing IP Addresses</span> <span className="time">10 min</span></li>
                <li><span>Downtime Monitoring</span> <span className="time">10 min</span></li>
                <li><span>Continuous Maintenance</span> <span className="time">∞</span></li>
              </ul>
              <div className="total-effort">
                <span className="total-label">Total Manual Work</span>
                <span className="total-value">High Risk</span>
              </div>
            </div>

            <div className="comparison-divider"></div>

            <div className="comparison-right">
              <h4 className="method-label">The CloseClaw Way</h4>
              <div className="instant-badge">Secured</div>
              <p className="instant-desc">
                We handle the heavy lifting. Your agent gets a dedicated, isolated server 
                with zero public exposure. 100% private. 100% safe.
              </p>
              <div className="instant-features">
                <div className="i-feature"><Check size={16} /> Isolated Sovereignty</div>
                <div className="i-feature"><Check size={16} /> Private Mesh Network</div>
                <div className="i-feature"><Check size={16} /> Instant Recovery</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section - Simple & Secure */}
        <section id="features" className="features-section">
          <div className="section-header">
             <h2>Enterprise Shield. Human Simple.</h2>
             <p>The most advanced infrastructure for OpenClaw agents, hidden behind a simple interface.</p>
          </div>
          
          <div className="bento-grid">
            <Card className="bento-card card-cost" hoverable>
              <div className="card-content">
                <div className="card-header">
                  <div className="status-badge"><span className="dot green"></span>Optimized</div>
                  <h3>Token Efficiency</h3>
                </div>
                <div className="visual-cost">
                   <div className="cost-bar high">
                      <span>Standard</span>
                      <div className="bar-fill red"></div>
                   </div>
                   <div className="cost-bar low">
                      <span>CloseClaw</span>
                      <div className="bar-fill green"></div>
                      <div className="savings-badge">Type 0.2x</div>
                   </div>
                </div>
                <p>Strategic context handling ensures your agent uses the minimum tokens required, cutting your AI costs by up to 80%.</p>
              </div>
            </Card>

            <Card className="bento-card card-routing" hoverable>
              <div className="visual-hex-grid">
                 <div className="hex opacity-30"><BrandIcons.OpenAI /></div>
                 <div className="hex active"><BrandIcons.Anthropic /></div>
                 <div className="hex opacity-30"><BrandIcons.Gemini /></div>
              </div>
              <h3>Intelligent Brains</h3>
              <p>Automatically routes tasks between GPT-4, Claude 3.5, and Gemini Pro for the best results.</p>
            </Card>

            <Card className="bento-card card-security" hoverable>
              <div className="card-content horizontal">
                <div className="text-content">
                  <h3>Air-Gapped Security</h3>
                  <p>Your agent server is isolated from the public web. It connects only via a secure, private tunnel that you control.</p>
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
                 <BrandIcons.Brave />
               </div>
               <h3>Privacy-First Browsing</h3>
               <p>Equipped with a secure, headless Brave instance for agent-led research with zero tracking or exposure.</p>
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

      {/* Mock Billing Modal (Unchanged logic) */}
      {showBilling && (
        <div className="modal-overlay">
          <Card className="modal billing-modal">
            <div className="modal-header">
              <div className="traffic-lights">
                <div className="light red"></div>
                <div className="light yellow"></div>
                <div className="light green"></div>
              </div>
              <h3>Select a Plan</h3>
            </div>
            
            <div className="plan-grid">
               <PlanCard 
                  name="Base" 
                  price="$50" 
                  features={['Isolated GCP Instance', '$20 API Credits', 'Basic Mesh Network']}
                  onSelect={() => handlePlanSelect('Basic')}
               />
               <PlanCard 
                  name="Guardian" 
                  price="$75" 
                  features={['High-Memory VM', '$35 API Credits', 'Ghost Mesh (No Public IP)', 'Priority Recovery']}
                  isPopular
                  onSelect={() => handlePlanSelect('Pro')}
               />
               <PlanCard 
                  name="Fortress" 
                  price="$100" 
                  features={['Custom Infrastructure', '$55 API Credits', 'Air-Gapped Gateway', 'White-labeled Host']}
                  onSelect={() => handlePlanSelect('Enterprise')}
               />
            </div>
            
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setShowBilling(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// Helper for Plan Cards (Unchanged)
const PlanCard: React.FC<{
  name: string;
  price: string;
  features: string[];
  isPopular?: boolean;
  onSelect: () => void;
}> = ({ name, price, features, isPopular, onSelect }) => (
  <div className={`plan-card ${isPopular ? 'popular' : ''}`} onClick={onSelect}>
    {isPopular && <div className="popular-badge">Most Popular</div>}
    <h4>{name}</h4>
    <div className="price">{price}<span className="period">/mo</span></div>
    <ul className="features">
      {features.map((f, i) => (
        <li key={i}><Check size={14} className="check-icon" /> {f}</li>
      ))}
    </ul>
    <Button variant={isPopular ? 'primary' : 'secondary'} fullWidth>Select</Button>
  </div>
);
