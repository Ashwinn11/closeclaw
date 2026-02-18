import React from 'react';
import './IconCluster.css';
import { BrandIcons } from './BrandIcons';

export const IconCluster: React.FC = () => {
  const innerSatellites = [
    { Icon: BrandIcons.Telegram, className: 'satellite-1' },
    { Icon: BrandIcons.Discord, className: 'satellite-2' },
    { Icon: BrandIcons.Slack, className: 'satellite-3' },
    { Icon: BrandIcons.iMessage, className: 'satellite-4' },
  ];

  const outerSatellites = [
    { Icon: BrandIcons.Brave, className: 'satellite-5' },
    { Icon: BrandIcons.GitHub, className: 'satellite-6' },
    { Icon: BrandIcons.Gmail, className: 'satellite-7' },
    { Icon: BrandIcons.OpenAI, className: 'satellite-8' },
    { Icon: BrandIcons.Anthropic, className: 'satellite-9' },
    { Icon: BrandIcons.Gemini, className: 'satellite-10' },
  ];

  return (
    <div className="icon-cluster">
      <div className="icon-node main-node">
        <div className="pulse-ring"></div>
        <div className="logo-placeholder">CC</div>
      </div>
      
      <div className="orbit-wrap inner-orbit">
        {innerSatellites.map((sat, i) => (
          <div key={i} className={`icon-node satellite ${sat.className}`}>
            <div className="sat-icon-wrapper">
              <sat.Icon />
            </div>
          </div>
        ))}
      </div>

      <div className="orbit-wrap outer-orbit">
        {outerSatellites.map((sat, i) => (
          <div key={i} className={`icon-node satellite ${sat.className}`}>
            <div className="sat-icon-wrapper">
              <sat.Icon />
            </div>
          </div>
        ))}
      </div>

      <svg className="nexus-lines" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="1" fill="none" />
      </svg>
    </div>
  );
};
