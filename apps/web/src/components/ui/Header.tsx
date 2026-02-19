import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useGateway } from '../../context/GatewayContext';
import './Header.css';
import { Button } from './Button';
import { Menu } from 'lucide-react';

const StatusIndicator: React.FC = () => {
  const { status, error } = useGateway();
  const [showModal, setShowModal] = useState(false);

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'error':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <>
      <button
        className="connection-status"
        onClick={() => setShowModal(true)}
        title={error || getStatusText()}
      >
        <span className="status-icon">{getStatusIcon()}</span>
        <span className="status-text">{getStatusText()}</span>
      </button>

      {showModal && (
        <div className="status-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="status-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Connection Status</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-content">
              <div className="status-info">
                <span className="status-icon-large">{getStatusIcon()}</span>
                <div>
                  <p className="status-name">{getStatusText()}</p>
                  {error && <p className="status-error">{error}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div className="header-container">
      <header className="glass-header">
        {/* Left: Logo */}
        <div className="header-left">
          <div className="logo-icon"></div>
          <span className="logo-text">CloseClaw</span>
        </div>

        {/* Center: Navigation - Hidden on mobile, shown on desktop */}
        <nav className="header-nav">
          <a href="#features" className="nav-link">Features</a>
          <a href="#how-it-works" className="nav-link">How it Works</a>
          <a href="#pricing" className="nav-link">Pricing</a>
        </nav>

        {/* Right: CTA */}
        <div className="header-right">
          {isAuthenticated && <StatusIndicator />}
          <Button
            variant="primary"
            size="sm"
            className="get-started-btn"
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
          >
            {isAuthenticated ? 'Dashboard' : 'Get Started'}
          </Button>
          {/* Mobile Menu Toggle */}
          <button className="mobile-menu-toggle">
            <Menu size={24} color="var(--text-primary)" />
          </button>
        </div>
      </header>
    </div>
  );
};
