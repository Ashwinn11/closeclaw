import { type FC } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './InfoModal.css';

export type InfoModalType = 'about';

interface InfoModalProps {
  type: InfoModalType;
  onClose: () => void;
}

const ABOUT_CONTENT = (
  <>
    <div className="info-modal-about-hero" style={{ textAlign: 'center', padding: '2rem 0' }}>
      <img src="/logo.png" alt="CloseClaw" className="info-modal-logo" style={{ width: '64px', marginBottom: '1rem' }} />
      <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em' }}>CloseClaw</h2>
      <p className="info-modal-tagline" style={{ color: 'var(--accent-primary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.2em' }}>Sovereign AI Infrastructure</p>
    </div>

    <p>CloseClaw provides elite-tier infrastructure for autonomous AI agents. We specialize in the rapid deployment of isolated OpenClaw instances, giving you the power of frontier models with the security of a private sandbox.</p>

    <p>Our philosophy is **iOS-first**. We believe management should be mobile-native and secure. This web dashboard serves as your "Command Center" for orchestrating complex workflows and monitoring large-scale token usage.</p>

    <p>Built for teams and individuals who demand absolute privacy, CloseClaw ensures your intelligence remains your own.</p>
  </>
);

const MODAL_CONFIG: Record<InfoModalType, { title: string; content: React.ReactNode }> = {
  about: { title: 'About CloseClaw', content: ABOUT_CONTENT },
};

export const InfoModal: FC<InfoModalProps> = ({ type, onClose }) => {
  const { title, content } = MODAL_CONFIG[type];

  const modal = (
    <div className="info-modal-overlay" onClick={onClose}>
      <div className="info-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="info-modal-header">
          <h2>{title}</h2>
          <button className="info-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="info-modal-body">
          {content}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
