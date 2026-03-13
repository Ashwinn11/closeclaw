import { useState } from 'react';

import './LandingPage.css';
import { Card } from '../components/ui/Card';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Header } from '../components/ui/Header';
import { Footer } from '../components/ui/Footer';
import { InfoModal, type InfoModalType } from '../components/ui/InfoModal';
import { LoginModal } from '../components/ui/LoginModal';
import { ProductPreview } from '../components/ui/ProductPreview';
import { Check, Zap, Globe, Smartphone, Shield } from 'lucide-react';


export const LandingPage: React.FC = () => {
  const [infoModal, setInfoModal] = useState<InfoModalType | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);


  const handleGetStarted = () => {
    window.open('https://apps.apple.com', '_blank');
  };

  return (
    <div className="landing-page">
      <NebulaBackground />
      <Header />

      <main className="content-wrapper">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="sovereign-badge">
              <span className="hero-badge-dot"></span>
              OpenClaw ready in 60s
            </div>
            <h1 className="hero-title">
              Sovereign <span className="text-gradient">Platform.</span>
            </h1>
            <p className="hero-subtitle">
              Your private agentic workspace. Decentralized, isolated, and deployed instantly to your favorite channels.
            </p>

            <div className="hero-ctas">
              <img 
                src="/appstore.png" 
                alt="Download on the App Store" 
                className="hero-app-store-badge"
                onClick={() => window.open('https://apps.apple.com', '_blank')}
                style={{ cursor: 'pointer', height: '56px' }}
              />
            </div>
          </div>

          <div className="hero-visual">
            <ProductPreview />
          </div>
        </section>

        {/* Trust/Metric Bar */}
        <section className="trust-bar">
          <div className="trust-item">
            <span className="trust-val">60s</span>
            <span className="trust-label">Provisioning</span>
          </div>
          <div className="trust-divider"></div>
          <div className="trust-item">
            <span className="trust-val">99.9%</span>
            <span className="trust-label">Platform Uptime</span>
          </div>
          <div className="trust-divider"></div>
          <div className="trust-item">
            <span className="trust-val">100%</span>
            <span className="trust-label">Private Instances</span>
          </div>
        </section>

        {/* Comparison Section */}
        <section className="comparison-section">
          <div className="comparison-header">
            <div className="comparison-badge">Surgical Precision</div>
            <h2 className="comparison-title">The architecture of freedom.</h2>
          </div>

          <div className="comparison-grid">
            <div className="comparison-left">
              <h4 className="method-label">Legacy Maintenance</h4>
              <ul className="effort-list">
                <li><span>Infrastructure Orchestration</span> <span className="time">20 min</span></li>
                <li><span>API Gateway Integration</span> <span className="time">30 min</span></li>
                <li><span>Critical System Recovery</span> <span className="time">Unpredictable</span></li>
                <li><span>Kernel Security Updates</span> <span className="time">Persistent</span></li>
              </ul>
              <div className="total-effort">
                <span className="total-label">Operational Overload</span>
                <span className="total-value">High</span>
              </div>
            </div>

            <div className="comparison-right">
              <h4 className="method-label">CloseClaw Engine</h4>
              <div className="instant-badge">Optimized</div>
              <p className="instant-desc">
                We've automated the entire stack. From network isolation to model routing, our engine handles the complexity so you can focus on result.
              </p>
              <div className="instant-features">
                <div className="i-feature"><Check size={16} /> 99.9% Infrastructure Uptime</div>
                <div className="i-feature"><Check size={16} /> Military-Grade Sandbox</div>
                <div className="i-feature"><Check size={16} /> Autonomous Management</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section - Premium Bento Grid */}
        <section id="features" className="features-section">
          <div className="section-header">
            <div className="sovereign-badge" style={{ marginBottom: '1.5rem', animation: 'none' }}>
              <div className="hero-badge-dot"></div>
              Capabilities
            </div>
            <h2>Universal Intelligence. Delivered locally.</h2>
            <p>We deploy the world's most capable agentic core into your private environment, ensuring absolute privacy without sacrificing performance.</p>
          </div>

          <div className="bento-grid-refined">
            {/* 1. Infrastructure */}
            <Card className="feature-card-premium" hoverable>
              <div className="f-icon-wrap"><Zap size={20} /></div>
              <div className="f-content">
                <h3>Sovereign Infrastructure</h3>
                <p>Private OpenClaw instances deployed in 60s. No shared compute, just dedicated power.</p>
              </div>
            </Card>

            {/* 2. Intelligence */}
            <Card className="feature-card-premium" hoverable>
              <div className="f-icon-wrap"><Globe size={20} /></div>
              <div className="f-content">
                <h3>Unified Intelligence</h3>
                <p>Prompts are dynamically routed between GPT, Claude, and Gemini for peak efficiency.</p>
              </div>
            </Card>

            {/* 3. Privacy */}
            <Card className="feature-card-premium" hoverable>
              <div className="f-icon-wrap"><Shield size={20} /></div>
              <div className="f-content">
                <h3>Zero-Knowledge Privacy</h3>
                <p>Your data stays on your instance. We don't store logs or monitor conversations.</p>
              </div>
            </Card>

            {/* 4. Autonomy */}
            <Card className="feature-card-premium" hoverable>
              <div className="f-icon-wrap"><Smartphone size={20} /></div>
              <div className="f-content">
                <h3>Agentic Autonomy</h3>
                <p>Full tool use and headless browsing, accessible instantly via your favorite channels.</p>
              </div>
            </Card>
          </div>
        </section>



      </main>

      {/* Unified Glass Footer */}
      <Footer setInfoModal={setInfoModal} onGetStarted={handleGetStarted} />

      {/* Info Modals: About / ToS / Privacy */}
      {infoModal && (
        <InfoModal type={infoModal} onClose={() => setInfoModal(null)} />
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );
};
