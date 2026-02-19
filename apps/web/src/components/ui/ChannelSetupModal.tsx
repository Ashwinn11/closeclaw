import { useState, useEffect } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { BrandIcons } from './BrandIcons';
import { setupChannel, verifyChannel, getMyInstance, patchGatewayConfig } from '../../lib/api';
import { useGateway } from '../../context/GatewayContext';
import { Check, Loader2, AlertCircle, Bot, ArrowRight } from 'lucide-react';
import './ChannelSetupModal.css';

function buildChannelPatch(
  channel: string,
  token: string,
  appToken: string | undefined,
  ownerUserId: string,
): Record<string, unknown> {
  const ch = channel.toLowerCase();
  const ownerAllowFrom = [ownerUserId.trim()];
  let channelConfig: Record<string, unknown>;

  switch (ch) {
    case 'telegram':
      channelConfig = { enabled: true, botToken: token, dmPolicy: 'allowlist', allowFrom: ownerAllowFrom };
      break;
    case 'discord':
      channelConfig = { enabled: true, token, dmPolicy: 'allowlist', allowFrom: ownerAllowFrom, dm: { enabled: true } };
      break;
    case 'slack':
      channelConfig = { enabled: true, botToken: token, appToken: appToken!, dmPolicy: 'allowlist', allowFrom: ownerAllowFrom, dm: { enabled: true } };
      break;
    default:
      channelConfig = {};
  }

  return {
    channels: { [ch]: channelConfig },
    agents: {
      defaults: {
        model: {
          primary: 'google/gemini-3-flash-preview',
          fallbacks: ['anthropic/claude-sonnet-4-6', 'openai/gpt-5.2-codex'],
        },
        models: {
          'google/gemini-3-flash-preview': { alias: 'Gemini' },
          'anthropic/claude-sonnet-4-6': { alias: 'Sonnet' },
          'openai/gpt-5.2-codex': { alias: 'Codex' },
        },
      },
    },
    session: { dmScope: 'main' },
  };
}

type ChannelType = 'Telegram' | 'Discord' | 'Slack';
type SetupStep = 'token' | 'verified' | 'owner-id' | 'billing';

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
  const { status: gatewayStatus, connect } = useGateway();
  const [step, setStep] = useState<SetupStep>('token');
  const [token, setToken] = useState('');
  const [secondToken, setSecondToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [ownerUserId, setOwnerUserId] = useState('');
  const [ownerInfo, setOwnerInfo] = useState<{ name?: string, username?: string } | null>(null);
  const [polling, setPolling] = useState(false);
  const [manualOwnerId, setManualOwnerId] = useState('');
  const [hasInstance, setHasInstance] = useState(false);
  const [pendingPatch, setPendingPatch] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const checkInstance = async () => {
      try {
        const inst = await getMyInstance() as any;
        if (inst && (inst.status === 'active' || inst.status === 'claimed' || inst.status === 'running')) {
          setHasInstance(true);
        }
      } catch {
        setHasInstance(false);
      }
    };
    checkInstance();
  }, []);

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
      const data = await verifyChannel(channel.toLowerCase(), token.trim());
      console.log('[setup] Verification result:', data);
      setBotInfo(data);
      setStep('verified');
    } catch (err) {
      setError((err as Error).message || 'Failed to verify token. Check your connection and try again.');
    } finally {
      setVerifying(false);
    }
  };

  // Poll Telegram getUpdates to auto-detect sender's user ID
  const pollForOwnerId = async () => {
    setPolling(true);
    setError(null);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token.trim()}/getUpdates?limit=1&timeout=30`);
      const data = await res.json();
      const from = data?.result?.[0]?.message?.from;
      if (from?.id) {
        setOwnerUserId(String(from.id));
        setOwnerInfo({
          name: from.first_name,
          username: from.username ? `@${from.username}` : undefined
        });
      } else {
        setError('No message received yet. Send any message to your bot and try again.');
      }
    } catch {
      setError('Failed to poll for updates. Check your connection.');
    } finally {
      setPolling(false);
    }
  };

  const [deploying, setDeploying] = useState(false);

  // Apply pending config patch once WS connects (for new users whose instance was just claimed)
  useEffect(() => {
    if (gatewayStatus !== 'connected' || !pendingPatch) return;
    const patch = pendingPatch;
    setPendingPatch(null);
    patchGatewayConfig(patch)
      .then(() => onClose())
      .catch((err: Error) => {
        setError(err.message || 'Failed to configure Gateway');
        setDeploying(false);
      });
  }, [gatewayStatus, pendingPatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeploy = async (plan: string) => {
    setDeploying(true);
    setError(null);
    const resolvedOwnerId = ownerUserId || manualOwnerId;
    if (!resolvedOwnerId.trim()) {
      setError('Owner user ID is required.');
      setDeploying(false);
      return;
    }
    try {
      const result = await setupChannel({
        channel: channel.toLowerCase() as 'telegram' | 'discord' | 'slack',
        token: token.trim(),
        appToken: needsSecondToken ? secondToken.trim() : undefined,
        plan,
        ownerUserId: resolvedOwnerId.trim(),
      });

      // Dev mode or pending instance — no Gateway config needed yet
      if ((result as any).devMode) {
        onClose();
        return;
      }

      const patch = buildChannelPatch(channel, token.trim(), needsSecondToken ? secondToken.trim() : undefined, resolvedOwnerId.trim());

      if (gatewayStatus === 'connected') {
        await patchGatewayConfig(patch);
        onClose();
      } else {
        // Instance was just claimed — trigger WS connect, apply patch once connected
        setPendingPatch(patch);
        connect();
      }
    } catch (err) {
      setError((err as Error).message || 'Deployment failed. Please try again.');
      setDeploying(false);
    }
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
              {step === 'owner-id' && 'Identify Yourself'}
              {step === 'billing' && (hasInstance ? 'Linking Bot...' : 'Select Plan')}
            </span>
          </div>
        </div>

        {/* Progress dots */}
        <div className="setup-progress">
          <div className={`progress-dot ${step === 'token' ? 'active' : 'done'}`} />
          <div className="progress-line" />
          <div className={`progress-dot ${step === 'verified' ? 'active' : ['owner-id','billing'].includes(step) ? 'done' : ''}`} />
          <div className="progress-line" />
          <div className={`progress-dot ${step === 'owner-id' ? 'active' : step === 'billing' ? 'done' : ''}`} />
          {!hasInstance && (
            <>
              <div className="progress-line" />
              <div className={`progress-dot ${step === 'billing' ? 'active' : ''}`} />
            </>
          )}
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

                <div className="step-actions">
                  <Button
                    className="verify-btn"
                    variant="primary"
                    size="md"
                    onClick={handleVerify}
                    disabled={verifying}
                    fullWidth
                  >
                    {verifying ? (
                      <><Loader2 size={16} className="spin" /> Verifying...</>
                    ) : (
                      <>Verify Token <ArrowRight size={16} /></>
                    )}
                  </Button>
                </div>
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

            <div className="step-actions">
              <Button variant="secondary" onClick={() => setStep('token')}>← Back</Button>
              <Button
                className="deploy-btn"
                onClick={() => setStep('owner-id')}
              >
                Continue
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Identify Owner */}
        {step === 'owner-id' && (
          <div className="setup-step verified-step">
            {channel === 'Telegram' ? (
              <>
                <div className="bot-card">
                  <div className="bot-details">
                    {ownerInfo ? (
                      <>
                        <h4 style={{ color: 'var(--accent-primary)' }}>Detected: {ownerInfo.name}</h4>
                        <span className="bot-username">{ownerInfo.username || 'No username'}</span>
                        <span className="bot-id">ID: {ownerUserId}</span>
                      </>
                    ) : (
                      <>
                        <h4>Send a message to your bot</h4>
                        <span className="bot-username">Open Telegram, find your bot, and send any message to it.</span>
                        <span className="bot-id">We'll automatically detect your user ID.</span>
                      </>
                    )}
                  </div>
                </div>
                {error && <div className="token-error"><AlertCircle size={14} /><span>{error}</span></div>}
                
                <div className="step-actions">
                  <Button variant="secondary" onClick={() => setStep('verified')}>← Back</Button>
                  {!ownerUserId ? (
                    <Button className="deploy-btn" onClick= {pollForOwnerId} disabled={polling}>
                      {polling ? <><Loader2 size={16} className="spin" /> Waiting for message...</> : <><ArrowRight size={16} /> I sent a message</>}
                    </Button>
                  ) : (
                    <Button className="deploy-btn" onClick={() => { setStep('billing'); handleDeploy('Existing'); }}>
                      {hasInstance ? 'Confirm and Link Bot' : 'Confirm and Continue'} <ArrowRight size={16} />
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="bot-card">
                  <div className="bot-details">
                    <h4>Enter your {channel} user ID</h4>
                    {channel === 'Discord' && <span className="bot-username">Enable Developer Mode in Settings → Advanced, then right-click your name → Copy User ID.</span>}
                    {channel === 'Slack' && <span className="bot-username">Click your name in Slack → Profile → More → Copy member ID (starts with U).</span>}
                  </div>
                </div>
                <div className="token-input-area">
                  <label htmlFor="owner-id-input">Your {channel} User ID</label>
                  <div className="token-input-wrapper">
                    <input
                      id="owner-id-input"
                      type="text"
                      placeholder={channel === 'Discord' ? '123456789012345678' : 'U0AF1SHKFD0'}
                      value={manualOwnerId}
                      onChange={(e) => { setManualOwnerId(e.target.value); setError(null); }}
                      autoFocus
                    />
                  </div>
                </div>
                {error && <div className="token-error"><AlertCircle size={14} /><span>{error}</span></div>}
                <div className="step-actions">
                  <Button variant="secondary" onClick={() => setStep('verified')}>← Back</Button>
                  <Button className="deploy-btn" onClick={() => {
                    if (!manualOwnerId.trim()) { setError('Please enter your user ID'); return; }
                    setOwnerUserId(manualOwnerId.trim());
                    if (hasInstance) {
                      setStep('billing');
                      handleDeploy('Existing');
                    } else {
                      setStep('billing');
                    }
                  }}>
                    {hasInstance ? 'Link Bot to Instance' : 'Continue'} <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Billing / Plan Selection */}
        {step === 'billing' && (
          <div className="setup-step billing-step">
            {hasInstance ? (
              <div className="linking-state">
                <Loader2 size={48} className="spin" />
                <h3>Linking Bot to your Instance</h3>
                <p>We're configuring your existing Gateway to handle the new {channel} connection.</p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="error-msg" style={{ marginBottom: '1rem' }}>
                    <AlertCircle size={14} />
                    <span>{error}</span>
                  </div>
                )}
                <div className="plan-grid">
                  {planData.map((plan) => (
                    <div
                      key={plan.name}
                      className={`plan-card ${plan.isPopular ? 'popular' : ''} ${deploying ? 'disabled' : ''}`}
                      onClick={() => !deploying && handleDeploy(plan.name)}
                    >
                      {plan.isPopular && <div className="popular-badge">Most Popular</div>}
                      <h4>{plan.name}</h4>
                      <div className="price">{plan.price}<span className="period">/mo</span></div>
                      <ul className="features">
                        {plan.features.map((f, i) => (
                          <li key={i}><Check size={14} className="check-icon" /> {f}</li>
                        ))}
                      </ul>
                      <Button variant={plan.isPopular ? 'primary' : 'secondary'} fullWidth disabled={deploying}>
                        {deploying ? <><Loader2 size={14} className="spin" /> Deploying...</> : 'Deploy'}
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="step-actions">
                  <Button variant="secondary" onClick={() => setStep('verified')} disabled={deploying}>
                    ← Back to bot details
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
