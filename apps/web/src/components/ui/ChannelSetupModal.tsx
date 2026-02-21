import { useState, useEffect } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { BrandIcons } from './BrandIcons';
import { setupChannel, verifyChannel, getMyInstance, getCredits, createCheckout, patchGatewayConfig, getGatewayProviderConfig } from '../../lib/api';
import { buildChannelPatch } from '../../lib/channelConfig';
import { useGateway } from '../../context/GatewayContext';
import { useError } from '../../context/ErrorContext';
import { Check, Loader2, AlertCircle, Bot, ArrowRight } from 'lucide-react';
import './ChannelSetupModal.css';

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
  /** Pre-filled data from a billing redirect — skips straight to deploy */
  resumeData?: { token: string; appToken?: string; ownerUserId: string };
}

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="setup-link">{children}</a>
);

const Warn = ({ children }: { children: React.ReactNode }) => (
  <span className="setup-warn">{children}</span>
);

const channelConfig: Record<ChannelType, {
  icon: React.FC;
  color: string;
  glow: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  secondTokenLabel?: string;
  secondTokenPlaceholder?: string;
  instructions: React.ReactNode[];
  note?: React.ReactNode;
}> = {
  Telegram: {
    icon: BrandIcons.Telegram,
    color: '#2AABEE',
    glow: 'rgba(42, 171, 238, 0.15)',
    tokenLabel: 'Bot Token',
    tokenPlaceholder: '123456789:ABCdefGhIjKlMnOpQrStUvWxYz',
    instructions: [
      <>Open Telegram and search for <strong>@BotFather</strong> — it's the official Telegram bot.</>,
      <>Send <strong>/newbot</strong> and follow the prompts. Give your bot a display name (e.g. "My AI") and a username ending in <strong>bot</strong> (e.g. <em>myai_bot</em>).</>,
      <>BotFather will reply with a long <strong>API token</strong> — it looks like <code>123456789:ABC…</code>. Copy that whole string.</>,
      <>Paste the token in the box and click <strong>Verify →</strong></>,
    ],
  },
  Discord: {
    icon: BrandIcons.Discord,
    color: '#5865F2',
    glow: 'rgba(88, 101, 242, 0.15)',
    tokenLabel: 'Bot Token',
    tokenPlaceholder: 'MTE5NjI4...',
    instructions: [
      <>Go to the <A href="https://discord.com/developers/applications">Discord Developer Portal</A> and click <strong>New Application</strong>. Give it any name (e.g. "My AI").</>,
      <>In the left sidebar, click <strong>Bot</strong>. Then click <strong>Reset Token</strong> → <strong>Yes, do it!</strong> → copy the token that appears.</>,
      <><Warn>Critical:</Warn> Still on the Bot page, scroll down to <strong>Privileged Gateway Intents</strong> and turn on <strong>Message Content Intent</strong>. Without this, your bot won't be able to read messages. Hit <strong>Save Changes</strong>.</>,
      <>In the left sidebar, click <strong>OAuth2</strong> → <strong>URL Generator</strong>. Under Scopes tick <strong>bot</strong>. Under Bot Permissions tick <strong>Send Messages</strong>, <strong>Read Message History</strong>, and <strong>View Channels</strong>.</>,
      <>Copy the <strong>Generated URL</strong> at the bottom of that page, open it in a new tab, pick your server, and click <strong>Authorise</strong>. This adds the bot to your server.</>,
      <>Paste the bot token in the box on the right and click <strong>Verify →</strong></>,
    ],
    note: <>Don't have a server yet? <A href="https://support.discord.com/hc/en-us/articles/204849977">Create one free here</A> — it only takes a minute.</>,
  },
  Slack: {
    icon: BrandIcons.Slack,
    color: '#E01E5A',
    glow: 'rgba(224, 30, 90, 0.15)',
    tokenLabel: 'Bot Token (xoxb-…)',
    tokenPlaceholder: 'xoxb-your-bot-token',
    secondTokenLabel: 'App Token (xapp-…)',
    secondTokenPlaceholder: 'xapp-your-app-token',
    instructions: [
      <>Go to <A href="https://api.slack.com/apps">api.slack.com/apps</A> and click <strong>Create New App</strong> → <strong>From scratch</strong>. Name it anything and pick your workspace.</>,
      <>In the left sidebar click <strong>Socket Mode</strong> and toggle it <strong>On</strong>. When prompted, click <strong>Generate an app-level token</strong>, give it any name, add the <strong>connections:write</strong> scope, and click <strong>Generate</strong>. Copy the token shown — it starts with <code>xapp-</code>. This is your <strong>App Token</strong>.</>,
      <>In the sidebar click <strong>OAuth &amp; Permissions</strong>. Scroll to <strong>Bot Token Scopes</strong> and add these scopes: <code>chat:write</code>, <code>im:history</code>, <code>im:read</code>, <code>channels:history</code>, <code>app_mentions:read</code>.</>,
      <>In the sidebar click <strong>Event Subscriptions</strong>, toggle <strong>On</strong>, then expand <strong>Subscribe to bot events</strong> and add: <code>message.im</code> and <code>app_mention</code>. Click <strong>Save Changes</strong>.</>,
      <>In the sidebar click <strong>App Home</strong>. Under <em>Show Tabs</em>, tick <strong>Allow users to send Slash commands and messages from the messages tab</strong>.</>,
      <>Back in <strong>OAuth &amp; Permissions</strong>, scroll up and click <strong>Install to Workspace</strong> → <strong>Allow</strong>. Copy the <strong>Bot User OAuth Token</strong> that appears — it starts with <code>xoxb-</code>.</>,
      <>Paste both tokens in the boxes on the right and click <strong>Verify →</strong></>,
    ],
    note: <>Need help? The <A href="https://api.slack.com/apps">Slack App Settings</A> page has everything in one place — bookmark it.</>,
  },
};

const planData = [
  {
    name: 'Base',
    tagline: 'Light & always on',
    price: '$50',
    features: [
      'Dedicated AI on Telegram, Discord & Slack',
      '$20 in AI credits/mo',
      'Your own private server, never shared',
    ],
  },
  {
    name: 'Guardian',
    tagline: 'For daily productivity',
    price: '$75',
    features: [
      'Everything in Base',
      '$35 in AI credits/mo',
      'Best for heavy daily use',
      'Multi-step tasks & deep research',
    ],
    isPopular: true,
  },
  {
    name: 'Fortress',
    tagline: 'For power users',
    price: '$100',
    features: [
      'Everything in Guardian',
      '$50 in AI credits/mo',
      'Built for automation & long sessions',
      'Top up credits anytime',
    ],
  },
];

export const ChannelSetupModal: React.FC<ChannelSetupModalProps> = ({ channel, onClose, resumeData }) => {
  const { status: gatewayStatus, connect } = useGateway();
  const { showError } = useError();
  // If resuming after billing, start directly at billing step with pre-filled values
  const [step, setStep] = useState<SetupStep>(resumeData ? 'billing' : 'token');
  const [token, setToken] = useState(resumeData?.token ?? '');
  const [secondToken, setSecondToken] = useState(resumeData?.appToken ?? '');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [ownerUserId, setOwnerUserId] = useState(resumeData?.ownerUserId ?? '');
  const [ownerInfo, setOwnerInfo] = useState<{ name?: string, username?: string } | null>(null);
  const [polling, setPolling] = useState(false);
  const [manualOwnerId, setManualOwnerId] = useState('');
  const [hasInstance, setHasInstance] = useState(false);
  const [hasPlan, setHasPlan] = useState(false);
  const [pendingPatch, setPendingPatch] = useState<Record<string, unknown> | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const [inst, credits] = await Promise.all([
          getMyInstance() as Promise<any>,
          getCredits().catch(() => ({ api_credits: 0, plan: 'none' })),
        ]);
        if (inst && (inst.status === 'active' || inst.status === 'claimed' || inst.status === 'running')) {
          setHasInstance(true);
        }
        if (credits.plan && credits.plan !== 'none' && credits.plan !== 'cancelled') {
          setHasPlan(true);
        }
      } catch {
        // silently ignore — defaults to false
      } finally {
        setStatusChecked(true);
      }
    };
    checkStatus();
  }, []);

  // After billing redirect: auto-trigger deploy once instance/plan check is done.
  // We always deploy here — the user came back from a completed payment.
  // The channels.ts /setup endpoint handles instance claiming.
  useEffect(() => {
    if (!resumeData || !statusChecked || deploying) return;
    handleDeploy('Existing');
  }, [statusChecked]); // eslint-disable-line react-hooks/exhaustive-deps

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
      showError((err as Error).message || 'Failed to verify token. Check your connection and try again.', 'Verification Error');
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
      showError('Failed to poll for updates. Check your connection.', 'Polling Error');
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
        showError(err.message || 'Failed to configure Gateway', 'Gateway Setup Error');
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
      if (result.devMode) {
        onClose();
        return;
      }

      const channelPatch = buildChannelPatch(channel, token.trim(), needsSecondToken ? secondToken.trim() : undefined, resolvedOwnerId.trim());

      // Fetch provider config (proxy baseUrl + gateway token) from backend and merge in.
      // This ensures closeclaw-google/anthropic/openai providers are always registered,
      // even on VMs provisioned before the proxy was introduced.
      let providerPatch: Record<string, unknown> = {};
      try {
        providerPatch = await getGatewayProviderConfig();
      } catch { /* silently ignore — provider config may already be set */ }

      const patch = { ...channelPatch, ...providerPatch };

      if (gatewayStatus === 'connected') {
        await patchGatewayConfig(patch);
        onClose();
      } else {
        // Instance was just claimed — trigger WS connect, apply patch once connected
        setPendingPatch(patch);
        connect();
      }
    } catch (err) {
      showError((err as Error).message || 'Deployment failed. Please try again.', 'Deployment Error');
      setDeploying(false);
    }
  };

  const handlePlanSelect = async (planName: string) => {
    const resolvedOwnerId = ownerUserId || manualOwnerId;
    if (!resolvedOwnerId.trim()) {
      setError('Owner user ID is required.');
      return;
    }
    setDeploying(true);
    setError(null);
    try {
      const { checkoutUrl } = await createCheckout(planName);
      // Save setup state so dashboard can complete it after payment
      localStorage.setItem('cc_pending_setup', JSON.stringify({
        channel: channel.toLowerCase(),
        token: token.trim(),
        appToken: needsSecondToken ? secondToken.trim() : undefined,
        ownerUserId: resolvedOwnerId.trim(),
      }));
      window.location.href = checkoutUrl;
    } catch (err) {
      showError((err as Error).message || 'Failed to create checkout. Please try again.', 'Billing Error');
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
            <button className="light red" onClick={onClose} aria-label="Close">
              <svg width="6" height="6" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z" fill="currentColor"/>
              </svg>
            </button>
            <button className="light yellow" aria-label="Minimize">
              <svg width="8" height="2" viewBox="0 0 14 2" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H0V0H14V2Z" fill="currentColor"/>
              </svg>
            </button>
            <button className="light green" aria-label="Zoom">
              <svg width="6" height="6" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2H12L8.5 5.5L9.5 6.5L13 3V7H14V0H7V1H8V2ZM6 12H2L5.5 8.5L4.5 7.5L1 11V7H0V14H7V13H6V12Z" fill="currentColor"/>
              </svg>
            </button>
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
              {step === 'billing' && ((hasInstance || hasPlan || !!resumeData) ? 'Linking Bot...' : 'Select Plan')}
            </span>
          </div>
        </div>

        <div className="modal-content">

        {/* Progress dots */}
        <div className="setup-progress">
          <div className={`progress-dot ${step === 'token' ? 'active' : 'done'}`} />
          <div className="progress-line" />
          <div className={`progress-dot ${step === 'verified' ? 'active' : ['owner-id','billing'].includes(step) ? 'done' : ''}`} />
          <div className="progress-line" />
          <div className={`progress-dot ${step === 'owner-id' ? 'active' : step === 'billing' ? 'done' : ''}`} />
          {!hasInstance && !hasPlan && (
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
              {config.note && (
                <div className="setup-note">{config.note}</div>
              )}
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
              Your bot is verified and ready to go. Next, we just need to know which account
              is yours so your AI knows who to listen to.
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
                        <h4>Say hello to your bot</h4>
                        <span className="bot-username">Open Telegram, find your new bot, and send it any message.</span>
                        <span className="bot-id">We'll detect who you are automatically — no ID needed.</span>
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
                    <Button className="deploy-btn" onClick={() => {
                      setStep('billing');
                      if (hasInstance || hasPlan) handleDeploy('Existing');
                    }}>
                      {(hasInstance || hasPlan) ? 'Confirm and Link Bot' : 'Confirm and Continue'} <ArrowRight size={16} />
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="bot-card">
                  <div className="bot-details">
                    <h4>One last thing — who are you?</h4>
                    {channel === 'Discord' && (
                      <span className="bot-username">
                        Open Discord → <strong>Settings</strong> (gear icon) → <strong>Advanced</strong> → turn on <strong>Developer Mode</strong>.<br />
                        Then close Settings, right-click your own name anywhere in Discord, and tap <strong>Copy User ID</strong>.
                      </span>
                    )}
                    {channel === 'Slack' && (
                      <span className="bot-username">
                        In Slack, click your <strong>profile picture</strong> or name → <strong>View Profile</strong> → click the <strong>⋯ More</strong> button → <strong>Copy member ID</strong>.<br />
                        It starts with the letter <strong>U</strong> (e.g. <code>U0AF1SHKFD0</code>).
                      </span>
                    )}
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
                    setStep('billing');
                    if (hasInstance || hasPlan) handleDeploy('Existing');
                  }}>
                    {(hasInstance || hasPlan) ? 'Link Bot to Instance' : 'Continue'} <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Billing / Plan Selection */}
        {step === 'billing' && (
          <div className="setup-step billing-step">
            {(hasInstance || hasPlan || !!resumeData) ? (
              <div className="linking-state">
                <Loader2 size={48} className="spin" />
                <h3>{hasInstance ? 'Linking Bot to your Instance' : 'Claiming your Agent Instance'}</h3>
                <p>We're configuring your Gateway to handle the new {channel} connection.</p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="error-msg" style={{ marginBottom: '1rem' }}>
                    <AlertCircle size={14} />
                    <span>{error}</span>
                  </div>
                )}
                <div className="billing-step-header">
                  <h3>Pick a plan that fits your life</h3>
                  <p className="billing-step-subtitle">Billed monthly · Cancel anytime</p>
                </div>
                <div className="plan-grid">
                  {planData.map((plan) => (
                    <div
                      key={plan.name}
                      className={`plan-card ${plan.isPopular ? 'popular' : ''} ${deploying ? 'disabled' : ''}`}
                      onClick={() => !deploying && handlePlanSelect(plan.name)}
                    >
                      {plan.isPopular && <div className="popular-badge">Most Popular</div>}
                      <div className="plan-top">
                        <h4>{plan.name}</h4>
                        <p className="plan-tagline">{plan.tagline}</p>
                      </div>
                      <div className="price">{plan.price}<span className="period">/mo</span></div>
                      <ul className="features">
                        {plan.features.map((f, i) => (
                          <li key={i}><Check size={13} className="check-icon" />{f}</li>
                        ))}
                      </ul>
                      <Button variant={plan.isPopular ? 'primary' : 'secondary'} fullWidth disabled={deploying}>
                        {deploying ? <><Loader2 size={14} className="spin" /> Redirecting...</> : 'Get Started →'}
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
        </div>
      </Card>
    </div>
  );
};
