import React from 'react';
import { Terminal, Shield, Globe, MoreVertical, Phone, Paperclip, Send } from 'lucide-react';
import { BrandIcons } from './BrandIcons';
import './ProductPreview.css';

export const ProductPreview: React.FC = () => {
  return (
    <div className="pp-wrapper">
      {/* Orbiting Icons */}
      <div className="pp-orbit">
        <div className="orbit-icon icon-1"><BrandIcons.Telegram /></div>
        <div className="orbit-icon icon-2"><BrandIcons.Discord /></div>
        <div className="orbit-icon icon-3"><BrandIcons.Slack /></div>
        <div className="orbit-icon icon-4"><BrandIcons.OpenAI /></div>
        <div className="orbit-icon icon-5"><BrandIcons.Anthropic /></div>
        <div className="orbit-icon icon-6"><BrandIcons.Gemini /></div>
      </div>

      <div className="pp-chat">
        <div className="pp-chat-header">
          <div className="pp-header-left">
            <div className="pp-bot-avatar">C</div>
            <div className="pp-bot-info">
              <span className="pp-bot-name">CloseClaw Agent</span>
              <span className="pp-bot-status">online</span>
            </div>
          </div>
          <div className="pp-header-actions">
            <Phone size={16} className="pp-action-icon" />
            <MoreVertical size={16} className="pp-action-icon" />
          </div>
        </div>
        
        <div className="pp-chat-body">
          <div className="pp-message user">
            Find the latest OpenClaw updates.
            <span className="pp-time">12:42 PM</span>
          </div>
          
          <div className="pp-message bot">
            <div className="pp-action">
               <Globe size={12} /> Searching OpenClaw GitHub...
            </div>
            <p>Managed code hosting live! Highlights:</p>
            <ul>
              <li>60-second VM provisioning</li>
              <li>Dedicated status dashboard</li>
              <li>Multi-channel support (TG/Discord)</li>
            </ul>
            <div className="pp-source">Source: closeclaw.in</div>
            <span className="pp-time">12:42 PM</span>
          </div>
        </div>

        <div className="pp-chat-footer">
          <Paperclip size={18} className="pp-footer-icon" />
          <div className="pp-input-sim">Type a message...</div>
          <div className="pp-send-btn">
            <Send size={16} />
          </div>
        </div>
      </div>
      
      <div className="pp-stats">
        <div className="pp-stat-card">
          <div className="pp-stat-header">
            <div className="pp-pulse"></div>
            <span>Private VM Status</span>
          </div>
          <div className="pp-stat-val">Healthy</div>
          <div className="pp-stat-sub">Uptime: 99.9%</div>
        </div>
        
        <div className="pp-stat-card secondary">
          <Shield size={16} className="pp-icon-shield" />
          <span>Security Isolated</span>
        </div>
      </div>

      <div className="pp-floating-terminal">
        <Terminal size={14} />
        <span>$ provision --vm-id=cc-732</span>
      </div>
    </div>
  );
};
