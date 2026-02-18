import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Header.css';
import { Button } from './Button';
import { Menu } from 'lucide-react';

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
