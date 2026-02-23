import { useParams, Navigate } from 'react-router-dom';
import solutions from '../data/pseo-solutions.json';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Header } from '../components/ui/Header';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { BrandIcons } from '../components/ui/BrandIcons';
import { Terminal, Check, Shield, Zap, Lock } from 'lucide-react';
import './LandingPage.css'; // Reuse existing styles
import { useState } from 'react';
import { ChannelSetupModal } from '../components/ui/ChannelSetupModal';
import { InfoModal, type InfoModalType } from '../components/ui/InfoModal';

export const SolutionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [setupChannel, setSetupChannel] = useState<'Telegram' | 'Discord' | 'Slack' | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModalType | null>(null);

  const solution = solutions.find((s) => s.id === id);

  if (!solution) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="landing-page solution-page">
      <NebulaBackground />
      <Header />

      <main className="content-wrapper">
        <article className="hero-section">
          <div className="hero-content">
            <div className="sovereign-badge">{solution.industry} AI Solutions</div>
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

        <section className="features-section">
          <header className="section-header">
             <h2>Why {solution.industry} teams trust CloseClaw</h2>
             <p>{solution.pain_point} {solution.solution}</p>
          </header>

          <div className="bento-grid">
            <Card className="bento-card" hoverable>
              <article>
                <Shield size={24} className="icon-accent" />
                <h3>Isolated Infrastructure</h3>
                <p>Your AI instance runs on a dedicated server with no public IP address. It's completely isolated from other users.</p>
              </article>
            </Card>
            <Card className="bento-card" hoverable>
              <Lock size={24} className="icon-accent" />
              <h3>Zero Data Training</h3>
              <p>We use enterprise APIs that guarantee your data is never used to train future AI models. What you say stays on your server.</p>
            </Card>
            <Card className="bento-card" hoverable>
              <Zap size={24} className="icon-accent" />
              <h3>Instant Deployment</h3>
              <p>Get a private, production-ready AI server for your {solution.industry} workflows in less than 60 seconds.</p>
            </Card>
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
