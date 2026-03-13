import React from 'react';
import { Globe, MoreVertical, Smartphone, Shield, Wifi, Battery } from 'lucide-react';
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

      <div className="iphone-mockup">
        <div className="iphone-frame">
          <div className="iphone-screen">
            <div className="iphone-status-bar">
              <span className="time">9:41</span>
              <div className="status-icons">
                <Wifi size={12} />
                <Battery size={12} />
              </div>
            </div>

            <div className="pp-chat">
              <div className="pp-chat-header">
                <div className="pp-header-left">
                  <div className="pp-bot-avatar">C</div>
                  <div className="pp-bot-info">
                    <span className="pp-bot-name">CloseClaw</span>
                    <span className="pp-bot-status">online</span>
                  </div>
                </div>
                <div className="pp-header-actions">
                  <MoreVertical size={16} className="pp-action-icon" />
                </div>
              </div>
              
              <div className="pp-chat-body">
                <div className="pp-message user">
                  Deploy my OpenClaw VM.
                </div>
                
                <div className="pp-message bot">
                  <div className="pp-action">
                    <Globe size={12} /> Provisioning private instance...
                  </div>
                  <p>OpenClaw running on dedicated VM. Status:</p>
                  <div className="vm-status-line">
                    <div className="status-dot healthy"></div>
                    <span>Instance: Healthy</span>
                  </div>
                  <div className="vm-status-line">
                    <div className="status-dot active"></div>
                    <span>Uptime: 99.9%</span>
                  </div>
                </div>
              </div>

              <div className="pp-chat-footer">
                <div className="pp-input-sim">Ask anything...</div>
                <div className="pp-send-btn">
                  <Smartphone size={14} />
                </div>
              </div>
            </div>
          </div>
          <div className="iphone-home-indicator"></div>
        </div>
      </div>
      
      <div className="pp-stats">
        <div className="pp-stat-card">
          <div className="pp-stat-header">
            <div className="pp-pulse"></div>
            <span>Global Uptime</span>
          </div>
          <div className="pp-stat-val">99.99%</div>
        </div>
        
        <div className="pp-stat-card secondary">
          <Shield size={16} className="pp-icon-shield" />
          <span>E2E Encrypted</span>
        </div>
      </div>
    </div>
  );
};
