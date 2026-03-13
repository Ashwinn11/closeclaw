import React from 'react';
import { Terminal } from 'lucide-react';
import { Button } from './Button';
import './Header.css'; // Reusing some header glass styles if needed, or we'll define footer styles in LandingPage.css

interface FooterProps {
    setInfoModal: (type: 'about' | null) => void;
    onGetStarted?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ setInfoModal, onGetStarted }) => {
    return (
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
                    {onGetStarted && (
                        <Button className="footer-get-started" size="sm" onClick={onGetStarted}>
                            Get Started Now
                        </Button>
                    )}
                </div>

                <div className="footer-links-col">
                    <h4>Product</h4>
                    <a href="/#features">Features</a>
                    <a href="https://status.closeclaw.in">System Status</a>
                </div>

                <div className="footer-links-col">
                    <h4>Resources</h4>
                    <a href="https://docs.openclaw.ai" target="_blank" rel="noopener noreferrer">OpenClaw Docs</a>
                    <a href="/support">Help & Support</a>
                </div>

                <div className="footer-links-col">
                    <h4>Legal</h4>
                    <button className="footer-link-btn" onClick={() => setInfoModal('about')}>About</button>
                    <a href="/terms">Terms</a>
                    <a href="/privacy">Privacy Policy</a>
                </div>
            </div>
        </footer>
    );
};
