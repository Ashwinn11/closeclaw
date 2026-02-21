import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useGateway } from '../../context/GatewayContext';
import './Header.css';
import { Button } from './Button';
import { Menu, LogOut, X } from 'lucide-react';
import { LoginModal } from './LoginModal';

const StatusIndicator: React.FC = () => {
  const { status, error } = useGateway();

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
    <div
      className="connection-status no-hover"
      title={error || getStatusText()}
    >
      <span className="status-icon">{getStatusIcon()}</span>
      <span className="status-text">{getStatusText()}</span>
    </div>
  );
};

const UserProfile: React.FC = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  
  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="user-menu-container">
      <button className="user-profile-btn" onClick={() => setIsOpen(!isOpen)}>
        {user?.avatar ? (
          <img src={user.avatar} alt="Profile" />
        ) : (
          <span>{user?.name?.charAt(0) || 'U'}</span>
        )}
      </button>

      {isOpen && (
        <>
          <div style={{position: 'fixed', top:0, left:0, right:0, bottom:0, zIndex: 10}} onClick={() => setIsOpen(false)} />
          <div className="user-dropdown" style={{zIndex: 11}}>
            <div className="user-info">
              <p className="user-name">{user?.name || 'User'}</p>
              <p className="user-email">{user?.email}</p>
            </div>
            <button className="dropdown-item" onClick={handleLogout}>
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="header-container">
      <header className="glass-header">
        {/* Left: Logo */}
        <div className="header-left">
          <img src="/logo.png" alt="CloseClaw Logo" className="logo-icon" />
          <span className="logo-text">CloseClaw</span>
        </div>

        {/* Center: Navigation - Hidden on mobile, shown on desktop */}
        <nav className="header-nav">
          <a href="#features" className="nav-link">Features</a>
          <a href="#how-it-works" className="nav-link">How it Works</a>
          <a href="#pricing" className="nav-link">Pricing</a>
        </nav>

        <div className="header-right">
          {isAuthenticated ? (
            <>
              <StatusIndicator />
              <Button
                variant="primary"
                size="sm"
                className="get-started-btn"
                onClick={() => navigate('/dashboard')}
              >
                Dashboard
              </Button>
              <UserProfile />
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              className="get-started-btn"
              onClick={() => setShowLoginModal(true)}
            >
              Get Started
            </Button>
          )}
          {/* Mobile Menu Toggle */}
          <button className="mobile-menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} color="var(--text-primary)" /> : <Menu size={24} color="var(--text-primary)" />}
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="mobile-menu-dropdown">
          <a href="#features" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>Features</a>
          <a href="#how-it-works" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
          <a href="#pricing" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
          {!isAuthenticated && (
            <Button
              variant="primary"
              size="sm"
              className="mobile-get-started-btn"
              onClick={() => { setMobileMenuOpen(false); setShowLoginModal(true); }}
            >
              Get Started
            </Button>
          )}
        </div>
      )}

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </div>
  );
};
