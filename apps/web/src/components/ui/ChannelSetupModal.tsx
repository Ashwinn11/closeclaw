import { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { BrandIcons } from './BrandIcons';
import { Check, Loader2, AlertCircle, Bot, ArrowRight } from 'lucide-react';
import './ChannelSetupModal.css';

type ChannelType = 'Telegram' | 'Discord' | 'Slack';
type SetupStep = 'token' | 'verified' | 'billing';

interface BotInfo {
  name: string;
  username: string;
  id: string;
}

interface ChannelSetupModalProps {
  channel: ChannelType;
  onClose: () => void;
}

const channelConfig: Record<ChannelType, {
  icon: React.FC;
  color: string;
  glow: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  secondTokenLabel?: string;
  secondTokenPlaceholder?: string;
  instructions: string[];
}> = {
  Telegram: {
    icon: BrandIcons.Telegram,
    color: '#2AABEE',
    glow: 'rgba(42, 171, 238, 0.15)',
    tokenLabel: 'Bot Token',
    tokenPlaceholder: '123456789:ABCdefGhIjKlMnOpQrStUvWxYz',
    instructions: [
      'Open Telegram and search for @BotFather',
      'Tap Start, then send the command /newbot',
      'Choose a display name (e.g. "My Assistant")',
      'Choose a username ending in "bot" (e.g. my_assistant_bot)',
      'BotFather will reply with your HTTP API token — copy it',
      'Paste the token on the right →',
    ],
  },
  Discord: {
    icon: BrandIcons.Discord,
    color: '#5865F2',
    glow: 'rgba(88, 101, 242, 0.15)',
    tokenLabel: 'Bot Token',
    tokenPlaceholder: 'MTE5NjI4...',
    instructions: [
      'Go to discord.com/developers/applications',
      'Click "New Application" and give it a name',
      'Go to the "Bot" section in the left sidebar',
      'Click "Reset Token" and copy the new token',
      'Scroll down and enable "Message Content Intent"',
      'Go to "OAuth2 → URL Generator", select "bot" scope',
      'Use the generated URL to invite the bot to your server',
    ],
  },
  Slack: {
    icon: BrandIcons.Slack,
    color: '#E01E5A',
    glow: 'rgba(224, 30, 90, 0.15)',
    tokenLabel: 'Bot Token (xoxb-...)',
    tokenPlaceholder: 'xoxb-your-bot-token',
    secondTokenLabel: 'App Token (xapp-...)',
    secondTokenPlaceholder: 'xapp-your-app-token',
    instructions: [
      'Go to api.slack.com/apps and click "Create New App"',
      'Choose "From scratch" and give it a name + workspace',
      'Go to "Socket Mode" in the sidebar and enable it',
      'You\'ll be prompted to create an App Token — name it and copy it (starts with xapp-)',
      'Go to "OAuth & Permissions" and add bot scopes: chat:write, im:history, im:read',
      'Click "Install to Workspace" and authorize',
      'Copy the "Bot User OAuth Token" (starts with xoxb-)',
      'Paste both tokens on the right →',
    ],
  },
};

const planData = [
  {
    name: 'Base',
    price: '$50',
    features: ['Isolated GCP Instance', '$20 API Credits', 'Basic Mesh Network'],
  },
  {
    name: 'Guardian',
    price: '$75',
    features: ['High-Memory VM', '$35 API Credits', 'Ghost Mesh (No Public IP)', 'Priority Recovery'],
    isPopular: true,
  },
  {
    name: 'Fortress',
    price: '$100',
    features: ['Custom Infrastructure', '$55 API Credits', 'Air-Gapped Gateway', 'White-labeled Host'],
  },
];

export const ChannelSetupModal: React.FC<ChannelSetupModalProps> = ({ channel, onClose }) => {
  const [step, setStep] = useState<SetupStep>('token');
  const [token, setToken] = useState('');
  const [secondToken, setSecondToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);

  const config = channelConfig[channel];
  const ChannelIcon = config.icon;
  const needsSecondToken = !!config.secondTokenLabel;

  const handleVerify = async () => {
    if (!token.trim()) {
      setError('Please enter a bot token');
      return;
    }
    if (needsSecondToken && !secondToken.trim()) {
      setError('Please enter both tokens');
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      // For Telegram, we can actually verify via their public API
      if (channel === 'Telegram') {
        const res = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`);
        const data = await res.json();
        if (data.ok) {
          setBotInfo({
            name: data.result.first_name,
            username: `@${data.result.username}`,
            id: String(data.result.id),
          });
          setStep('verified');
        } else {
          setError('Invalid token — bot not found. Double-check with @BotFather.');
        }
      } else {
        // Mock verification for Discord/Slack for now
        await new Promise((r) => setTimeout(r, 1500));
        setBotInfo({
          name: `My ${channel} Bot`,
          username: `${channel.toLowerCase()}-bot`,
          id: 'mock-id-' + Date.now(),
        });
        setStep('verified');
      }
    } catch {
      setError('Failed to verify token. Check your connection and try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleDeploy = (plan: string) => {
    console.log(`Deploying ${channel} bot "${botInfo?.name}" on ${plan} plan`);
    alert(`🚀 Deploying ${botInfo?.name} (${botInfo?.username}) on the ${plan} plan!\n\nYour sovereign agent server is being provisioned...`);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !verifying) {
      handleVerify();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card className="modal setup-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ '--channel-color': config.color, '--channel-glow': config.glow } as React.CSSProperties}>
        {/* macOS glassmorphic title bar */}
        <div className="modal-titlebar">
          <div className="traffic-lights">
            <button className="light red" onClick={onClose} aria-label="Close" />
            <div className="light yellow" />
            <div className="light green" />
          </div>
          <div className="titlebar-center">
            <div className="titlebar-icon">
              <ChannelIcon />
            </div>
            <span className="titlebar-title">{channel}</span>
            <span className="titlebar-separator">—</span>
            <span className="titlebar-step">
              {step === 'token' && 'Enter Bot Token'}
              {step === 'verified' && 'Bot Verified'}
              {step === 'billing' && 'Select Plan'}
            </span>
          </div>
        </div>

        {/* Progress dots */}
        <div className="setup-progress">
          <div className={`progress-dot ${step === 'token' ? 'active' : 'done'}`} />
          <div className="progress-line" />
          <div className={`progress-dot ${step === 'verified' ? 'active' : step === 'billing' ? 'done' : ''}`} />
          <div className="progress-line" />
          <div className={`progress-dot ${step === 'billing' ? 'active' : ''}`} />
        </div>

        {/* Step 1: Token Entry — Split Layout */}
        {step === 'token' && (
          <div className="setup-step token-step">
            <div className="token-left">
              <h4>How to get your token{needsSecondToken ? 's' : ''}</h4>
              <ol>
                {config.instructions.map((instruction, i) => (
                  <li key={i}>
                    <span className="step-number">{i + 1}</span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="token-divider" />

            <div className="token-right">
              <div className="token-right-icon">
                <ChannelIcon />
              </div>
              <span className="token-right-label">{channel} Bot</span>

              <div className="token-input-area">
                <label htmlFor="bot-token">{config.tokenLabel}</label>
                <div className="token-input-wrapper">
                  <input
                    id="bot-token"
                    type="password"
                    placeholder={config.tokenPlaceholder}
                    value={token}
                    onChange={(e) => { setToken(e.target.value); setError(null); }}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    autoComplete="off"
                  />
                </div>

                {needsSecondToken && (
                  <>
                    <label htmlFor="app-token">{config.secondTokenLabel}</label>
                    <div className="token-input-wrapper">
                      <input
                        id="app-token"
                        type="password"
                        placeholder={config.secondTokenPlaceholder}
                        value={secondToken}
                        onChange={(e) => { setSecondToken(e.target.value); setError(null); }}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                      />
                    </div>
                  </>
                )}

                {error && (
                  <div className="token-error">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  className="verify-btn"
                  onClick={handleVerify}
                  disabled={verifying || !token.trim() || (needsSecondToken && !secondToken.trim())}
                >
                  {verifying ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify Bot
                      <ArrowRight size={16} />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Bot Verified */}
        {step === 'verified' && botInfo && (
          <div className="setup-step verified-step">
            <div className="bot-card" style={{ '--channel-color': config.color } as React.CSSProperties}>
              <div className="bot-avatar">
                <Bot size={32} />
              </div>
              <div className="bot-details">
                <h4>{botInfo.name}</h4>
                <span className="bot-username">{botInfo.username}</span>
                <span className="bot-id">ID: {botInfo.id}</span>
              </div>
              <div className="verified-badge">
                <Check size={14} />
                Verified
              </div>
            </div>

            <p className="verified-desc">
              Your bot has been identified and is ready to be connected to a dedicated, sovereign
              agent server. Choose a plan to deploy.
            </p>

            <Button
              className="deploy-btn"
              onClick={() => setStep('billing')}
            >
              Choose Plan & Deploy
              <ArrowRight size={16} />
            </Button>
          </div>
        )}

        {/* Step 3: Billing / Plan Selection */}
        {step === 'billing' && (
          <div className="setup-step billing-step">
            <div className="plan-grid">
              {planData.map((plan) => (
                <div
                  key={plan.name}
                  className={`plan-card ${plan.isPopular ? 'popular' : ''}`}
                  onClick={() => handleDeploy(plan.name)}
                >
                  {plan.isPopular && <div className="popular-badge">Most Popular</div>}
                  <h4>{plan.name}</h4>
                  <div className="price">{plan.price}<span className="period">/mo</span></div>
                  <ul className="features">
                    {plan.features.map((f, i) => (
                      <li key={i}><Check size={14} className="check-icon" /> {f}</li>
                    ))}
                  </ul>
                  <Button variant={plan.isPopular ? 'primary' : 'secondary'} fullWidth>
                    Deploy
                  </Button>
                </div>
              ))}
            </div>

            <button className="back-link" onClick={() => setStep('verified')}>
              ← Back to bot details
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};
