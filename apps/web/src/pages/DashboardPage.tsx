import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useGateway } from '../context/GatewayContext';
import { useError } from '../context/ErrorContext';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BrandIcons } from '../components/ui/BrandIcons';
import { ChannelSetupModal } from '../components/ui/ChannelSetupModal';
import { CronSetupModal } from '../components/ui/CronSetupModal';
import { listChannels, disconnectChannel, type ChannelConnection, getCronJobs, getUsageStats, getCredits, getUsageLog, createTopup, createCheckout, getBillingPortal, removeCronJob, patchGatewayConfig } from '../lib/api';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { ChatTab } from '../components/chat/ChatTab';
import {
  LogOut, Wifi, WifiOff, Clock, BarChart3,
  Plus, Activity, Zap, Loader2, AlertCircle, Calendar, Trash2, Smartphone, ArrowRight, Sun, Receipt, TrendingDown, Server, MessageCircle, CreditCard, Check
} from 'lucide-react';
import './DashboardPage.css';

type Tab = 'connections' | 'chat' | 'cron' | 'usage' | 'billing';
type ChannelType = 'Telegram' | 'Discord' | 'Slack';

interface ChannelDef {
  name: ChannelType;
  key: string; // lowercase key used in DB
  icon: React.FC;
  color: string;
  description: string;
}

const channelDefs: ChannelDef[] = [
  { name: 'Telegram', key: 'telegram', icon: BrandIcons.Telegram, color: '#2AABEE', description: 'Talk to your AI in any chat or group — just send a message' },
  { name: 'Discord', key: 'discord', icon: BrandIcons.Discord, color: '#5865F2', description: 'Add your AI to any server or chat with it directly' },
  { name: 'Slack', key: 'slack', icon: BrandIcons.Slack, color: '#E01E5A', description: 'Your AI in your workspace — ask questions, get tasks done' },
];

const upcomingChannels = [
  { name: 'WhatsApp', color: '#25D366', description: 'Your AI in the world\'s most popular messenger', icon: BrandIcons.WhatsApp },
  { name: 'Signal', color: '#3A76F0', description: 'Private conversations with your AI', icon: BrandIcons.Signal },
  { name: 'iMessage', color: '#34C759', description: 'Your AI in Apple Messages', icon: BrandIcons.iMessage },
  { name: 'Matrix', color: '#0DBD8B', description: 'Open-protocol AI messaging', icon: BrandIcons.Matrix },
];

const predefinedCrons = [
  {
     title: 'Morning Briefing',
     description: "Give me a morning briefing every day at 7 AM — weather, calendar, important emails, and top news",
     icon: <Sun size={20} color="#FFBD2E" />,
     schedule: '0 7 * * *',
     text: 'Give me a morning briefing — weather, calendar, important emails, and top news'
  },
  {
     title: 'Bill Reminder',
     description: "Remind me before every bill and subscription renewal — Netflix, AWS, rent, everything",
     icon: <Receipt size={20} color="#ECEEF3" />,
     schedule: '0 9 1 * *',
     text: 'Remind me to check upcoming bills and subscription renewals'
  },
  {
     title: 'Price Drop Alert',
     description: "Watch this product link and alert me instantly when the price drops",
     icon: <TrendingDown size={20} color="#2AABEE" />,
     schedule: '0 * * * *',
     text: 'Check the price of previously tracked items and alert me if there is a drop'
  },
  {
     title: 'Server Down Alert',
     description: "Monitor my website every 5 minutes and alert me immediately if it goes down",
     icon: <Server size={20} color="#FF5F56" />,
     schedule: '*/5 * * * *',
     text: 'Check if my website is online and responsive'
  }
];

const formatTokens = (tokens: number): string => {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return tokens.toString();
};

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { status: gatewayStatus, subscribe } = useGateway();
  const { showError } = useError();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('connections');
  const [cronView, setCronView] = useState<'active' | 'templates'>('active');
  const [setupChannel, setSetupChannel] = useState<ChannelType | null>(null);
  const [showCronModal, setShowCronModal] = useState(false);
  const [initialCronValues, setInitialCronValues] = useState<{name?: string, schedule?: string, text?: string} | undefined>(undefined);
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Cron State
  const [cronJobs, setCronJobs] = useState<any[]>([]);
  const [loadingCron, setLoadingCron] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);
  // Usage State
  const [usageData, setUsageData] = useState<any>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [updatedFields, setUpdatedFields] = useState<Set<string>>(new Set());

  // Billing return state
  const [topupSuccess, setTopupSuccess] = useState(false);
  const [toppingUp, setToppingUp] = useState<string | null>(null);
  const [channelResumeData, setChannelResumeData] = useState<{ token: string; appToken?: string; ownerUserId: string } | null>(null);

  // Billing tab state
  const [billingCredits, setBillingCredits] = useState<{ api_credits: number; plan: string; api_credits_cap: number; subscription_renews_at: string | null } | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const PLAN_DISPLAY: Record<string, string> = { basic: 'Base', guardian: 'Guardian', fortress: 'Fortress' };

  const fetchChannels = useCallback(async () => {
    try {
      const data = await listChannels();
      setConnections(data);
    } catch (err: any) {
      setConnections([]);
      showError(err.message || 'Failed to fetch channels', 'Fetch Error');
    } finally {
      setLoadingChannels(false);
    }
  }, [showError]);

const fetchCron = useCallback(async () => {
    setLoadingCron(true);
    setCronError(null);
    try {
      const data = await getCronJobs();
      setCronJobs(data);
    } catch (err: any) {
      setCronError(err.message || 'Failed to fetch cron jobs');
    } finally {
      setLoadingCron(false);
    }
  }, []);

  const fetchUsage = useCallback(async () => {
    setLoadingUsage(true);
    setUsageError(null);
    try {
      const [log, credits] = await Promise.all([getUsageLog(), getCredits()]);
      setUsageData({
        messagesThisMonth: log.totals.totalMessages,
        tokensUsed: log.totals.totalTokens,
        costThisMonth: log.totals.totalCost,
        apiCreditsLeft: credits.api_credits,
        byModel: log.byModel,
      });
    } catch (err: any) {
      // Fall back to gateway-reported usage if DB tables don't exist yet
      try {
        const data = await getUsageStats();
        setUsageData(data);
      } catch {
        setUsageError(err.message || 'Failed to fetch usage data');
      }
    } finally {
      setLoadingUsage(false);
    }
  }, []);

  const handleNewCron = (initial?: typeof initialCronValues) => {
    setInitialCronValues(initial);
    setShowCronModal(true);
  };

  const handleDeleteCron = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove the cron job "${name || id}"?`)) return;
    try {
      // Optimistically remove from UI
      setCronJobs(prev => prev.filter(j => j.id !== id));
      await removeCronJob(id);
      // Event will update state, but optimistic remove is instant
    } catch (err: any) {
      // Restore on error
      fetchCron();
      showError(`Failed to remove job: ${err.message}`, 'Deletion Failed');
    }
  };

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Handle return from LemonSqueezy checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get('cc_topup') === 'success') {
      window.history.replaceState({}, '', '/dashboard');
      setTopupSuccess(true);
      setActiveTab('usage');
      setTimeout(() => setTopupSuccess(false), 5000);
      return;
    }

    if (params.get('cc_setup') === 'resume') {
      window.history.replaceState({}, '', '/dashboard');
      const raw = localStorage.getItem('cc_pending_setup');
      if (!raw) return;
      localStorage.removeItem('cc_pending_setup');
      try {
        const pending = JSON.parse(raw);
        const channelName = (pending.channel.charAt(0).toUpperCase() + pending.channel.slice(1)) as ChannelType;
        setChannelResumeData({ token: pending.token, appToken: pending.appToken, ownerUserId: pending.ownerUserId });
        setSetupChannel(channelName);
      } catch { /* ignore corrupt localStorage */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTopup = async (pack: string) => {
    setToppingUp(pack);
    try {
      const { checkoutUrl } = await createTopup(pack);
      window.location.href = checkoutUrl;
    } catch (err: any) {
      showError(err.message || 'Failed to create checkout', 'Top-up Error');
      setToppingUp(null);
    }
  };

  const fetchBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const data = await getCredits();
      setBillingCredits(data);
    } catch { /* silently ignore */ } finally {
      setBillingLoading(false);
    }
  }, []);

  // Load billing info on mount so sidebar credits bar is populated
  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  const handleManageSubscription = async () => {
    setOpeningPortal(true);
    try {
      const { portalUrl } = await getBillingPortal();
      window.open(portalUrl, '_blank');
    } catch (err: any) {
      showError(err.message || 'Portal unavailable', 'Billing Error');
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleSubscribe = async (planName: string) => {
    setSubscribing(planName);
    try {
      const { checkoutUrl } = await createCheckout(planName);
      window.location.href = checkoutUrl;
    } catch (err: any) {
      showError(err.message || 'Failed to create checkout', 'Billing Error');
      setSubscribing(null);
    }
  };

  // Subscribe to cron updates via chat completion events
  // Gateway doesn't emit cron-specific events, so we silently re-fetch
  // after any chat completes (agent may have added/removed cron jobs)
  useEffect(() => {
    if (activeTab !== 'cron' || gatewayStatus !== 'connected') return;

    const unsubscribe = subscribe(
      ['chat'],
      (_event, payload: any) => {
        if (payload?.state !== 'final') return;
        // Silent refresh after agent conversation completes
        getCronJobs().then(setCronJobs).catch(() => {});
      }
    );

    // Fetch initial data
    fetchCron();

    return unsubscribe;
  }, [activeTab, gatewayStatus, subscribe]);

  // Subscribe to usage WebSocket events
  // Gateway emits 'chat' events with state: 'final' when a message completes
  useEffect(() => {
    if (activeTab !== 'usage' || gatewayStatus !== 'connected') return;

    const unsubscribe = subscribe(
      ['chat'],
      (_event, payload: any) => {
        if (payload?.state !== 'final') return;
        // Silent refresh — no loading spinner
        Promise.all([getUsageLog(), getCredits()])
          .then(([log, credits]) => {
            setUsageData({
              messagesThisMonth: log.totals.totalMessages,
              tokensUsed: log.totals.totalTokens,
              costThisMonth: log.totals.totalCost,
              apiCreditsLeft: credits.api_credits,
              byModel: log.byModel,
            });
            setUpdatedFields(new Set(['messagesThisMonth', 'tokensUsed', 'costThisMonth']));
          })
          .catch(() => {});
      }
    );

    // Fetch initial data (with loading spinner)
    fetchUsage();

    return unsubscribe;
  }, [activeTab, gatewayStatus, subscribe, fetchUsage]);

  // Clear highlight animation after delay
  useEffect(() => {
    if (updatedFields.size === 0) return;
    const timer = setTimeout(() => {
      setUpdatedFields(new Set());
    }, 2000);
    return () => clearTimeout(timer);
  }, [updatedFields]);

  const getChannelStatus = (key: string): { status: 'active' | 'pending' | 'inactive'; connectionId?: string } => {
    const conn = connections.find(c => c.channel === key && (c.status === 'active' || c.status === 'pending'));
    if (conn) return { status: conn.status as 'active' | 'pending', connectionId: conn.id };
    return { status: 'inactive' };
  };

  const handleDisconnect = async (connectionId: string) => {
    setDisconnecting(connectionId);
    try {
      // Disable channel in Gateway config via WS before deleting DB record
      const conn = connections.find(c => c.id === connectionId);
      if (conn?.channel && gatewayStatus === 'connected') {
        await patchGatewayConfig({
          channels: { [conn.channel]: null },
          plugins: { entries: { [conn.channel]: null } },
        }).catch(() => {}); // best-effort
      }
      await disconnectChannel(connectionId);
      await fetchChannels();
    } catch (err: any) {
      showError(err.message || 'Failed to disconnect channel', 'Disconnect Error');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleModalClose = () => {
    setSetupChannel(null);
    setChannelResumeData(null);
    fetchChannels(); // Refresh connections after modal closes
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'connections', label: 'Connections', icon: <Wifi size={16} /> },
    { key: 'chat', label: 'Chat', icon: <MessageCircle size={16} /> },
    { key: 'cron', label: 'Cron', icon: <Clock size={16} /> },
    { key: 'usage', label: 'Usage', icon: <BarChart3 size={16} /> },
    { key: 'billing', label: 'Subscription', icon: <CreditCard size={16} /> },
  ];

  return (
    <div className="dashboard-page">
      <NebulaBackground />
      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo" onClick={() => navigate('/')}>
            <div className="logo-icon small" />
            <span>CloseClaw</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`nav-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {billingCredits && (() => {
          const left = Number(billingCredits.api_credits ?? 0);
          const cap = Number(billingCredits.api_credits_cap ?? 0);
          const pct = cap > 0 ? Math.min(100, Math.max(0, (left / cap) * 100)) : 0;
          return (
            <div className="sidebar-credits-bar">
              <div className="scb-row">
                <span className="scb-label">API Credits</span>
                <span className="scb-value">${left.toFixed(2)}</span>
              </div>
              <div className="scb-track">
                <div className="scb-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })()}

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.avatar ? (
                <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '10px', objectFit: 'cover' }} />
              ) : (
                user?.name?.charAt(0) || 'U'
              )}
            </div>
            <div className="user-details">
              <span className="user-name">{user?.name || 'User'}</span>
              <span className="user-email">{user?.email || ''}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="dashboard-main">
        <div className="dashboard-header">
          <div>
            <h1>{tabs.find(t => t.key === activeTab)?.label}</h1>
            <p className="header-subtitle">
              {activeTab === 'connections' && 'Connect the apps you use every day'}
              {activeTab === 'chat' && 'Talk to your AI assistant directly'}
              {activeTab === 'cron' && 'Let your AI run tasks for you, automatically'}
              {activeTab === 'usage' && 'See how much you\'ve used and what\'s left'}
              {activeTab === 'billing' && 'Manage your plan and top up credits'}
            </p>
          </div>
          <div className={`server-status ${gatewayStatus}`}>
            <span className={`status-dot ${gatewayStatus}`} />
            <span>
              {gatewayStatus === 'connected' && 'Server Online'}
              {gatewayStatus === 'connecting' && 'Connecting...'}
              {gatewayStatus === 'disconnected' && 'Server Offline'}
              {gatewayStatus === 'error' && 'Connection Error'}
            </span>
          </div>
        </div>

        {/* Billing / setup banners */}
        {topupSuccess && (
          <div className="billing-banner success">
            <Zap size={15} />
            <span>Credits topped up! Your balance has been updated.</span>
            <button className="banner-close" onClick={() => setTopupSuccess(false)}>×</button>
          </div>
        )}

        <div className="dashboard-content">
          {/* Connections Tab */}
          {activeTab === 'connections' && (
            <div className="connections-tab">
              <div className="section-label">Active Channels</div>
              {loadingChannels ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                  <Loader2 size={24} className="spin" style={{ color: 'var(--text-secondary)' }} />
                </div>
              ) : (
                <div className="channels-grid">
                  {channelDefs.map((ch) => {
                    const Icon = ch.icon;
                    const { status, connectionId } = getChannelStatus(ch.key);
                    const isDisconnecting = disconnecting === connectionId;
                    return (
                      <Card key={ch.name} className="channel-card" hoverable>
                        <div className="channel-card-header">
                          <div className="channel-card-icon" style={{ '--ch-color': ch.color } as React.CSSProperties}>
                            <Icon />
                          </div>
                          <div className="channel-status top-right">
                             {status === 'active' ? (
                               <div className="status-badge connected"><Wifi size={12} /> Connected</div>
                             ) : status === 'pending' ? (
                               <div className="status-badge pending"><Loader2 size={12} className="spin" /> Provisioning</div>
                             ) : (
                               <div className="status-badge disconnected"><WifiOff size={12} /> Not Connected</div>
                             )}
                          </div>
                        </div>
                        <div className="channel-content">
                            <h3>{ch.name}</h3>
                            <p className="channel-desc">{ch.description}</p>
                        </div>
                        
                        {status === 'active' || status === 'pending' ? (
                          <Button
                            className="channel-action-btn"
                            variant="secondary"
                            size="sm"
                            onClick={() => connectionId && handleDisconnect(connectionId)}
                            disabled={isDisconnecting}
                          >
                            {isDisconnecting ? <><Loader2 size={14} className="spin" /> Disconnecting...</> : 'Disconnect'}
                          </Button>
                        ) : (
                          <Button
                            className="channel-action-btn"
                            variant="primary"
                            size="sm"
                            onClick={() => setSetupChannel(ch.name)}
                          >
                            Connect
                          </Button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}

              <div className="section-label upcoming-label">Coming Soon</div>
              <div className="channels-grid">
                {upcomingChannels.map((ch) => {
                  const Icon = ch.icon || MessageCircle;
                  return (
                    <Card key={ch.name} className="channel-card coming-soon" hoverable={false}>
                        <div className="channel-card-header">
                          <div className="channel-card-icon" style={{ '--ch-color': ch.color } as React.CSSProperties}>
                            <Icon />
                          </div>
                          <div className="channel-status top-right">
                               <div className="status-badge coming-soon">SOON</div>
                          </div>
                        </div>
                        <div className="channel-content">
                            <h3>{ch.name}</h3>
                            <p className="channel-desc">{ch.description}</p>
                        </div>
                        {/* No buttons for upcoming channels */}
                        <div className="coming-soon-spacer"></div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chat Tab */}
          {activeTab === 'chat' && (
             <ChatTab />
          )}

{/* Cron Tab */}
          {activeTab === 'cron' && (
            <div className="cron-tab">
              <div className="cron-header-redesigned">
                <div className="cron-tabs-toggle">
                  <button 
                    className={`cron-tab-btn ${cronView === 'active' ? 'active' : ''}`}
                    onClick={() => setCronView('active')}
                  >
                    Active Tasks
                  </button>
                  <button 
                    className={`cron-tab-btn ${cronView === 'templates' ? 'active' : ''}`}
                    onClick={() => setCronView('templates')}
                  >
                    Explore Templates
                  </button>
                </div>
              </div>

              <div className="pro-tip-banner">
                 <Smartphone size={16} />
                 <span><span className="highlight">Tip:</span> Your AI sends alerts straight to your phone — connect Telegram or Discord and never miss a beat.</span>
                 <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('connections'); }} className="connect-link">Connect <ArrowRight size={12} /></a>
              </div>

              {cronView === 'active' ? (
                <div className="cron-content-wrapper">
                  {loadingCron ? (
                    <div className="loading-state">
                      <Loader2 size={24} className="spin" />
                      <span>Fetching jobs from Gateway...</span>
                    </div>
                  ) : cronError ? (
                    <div className="error-state">
                      <AlertCircle size={24} />
                      <span>{cronError}</span>
                      <Button size="sm" variant="secondary" onClick={fetchCron}>Retry</Button>
                    </div>
                  ) : cronJobs.length === 0 ? (
                    <div className="empty-state-redesigned">
                       <div className="empty-icon"><Clock size={48} strokeWidth={1} /></div>
                       <h3>Nothing scheduled yet</h3>
                       <p>Your AI can send you daily briefings, price alerts, bill reminders — set it once and let it run</p>
                       <Button className="create-cron-pill large" onClick={() => handleNewCron()}>
                          Create Cron Job
                       </Button>
                    </div>
                  ) : (
                    <div className="cron-list">
                      {cronJobs.map((job) => (
                        <Card key={job.id} className="cron-card">
                          <div className="cron-info">
                            <div className="cron-name-row">
                              <Activity size={16} className={job.disabled ? 'cron-paused' : 'cron-active'} />
                              <h4>{job.name || job.id}</h4>
                              <span className={`cron-status-badge ${job.disabled ? 'paused' : 'active'}`}>
                                {job.disabled ? 'paused' : 'active'}
                              </span>
                            </div>
                            <div className="cron-meta">
                              <code>{
                                typeof job.schedule === 'string' 
                                  ? job.schedule 
                                  : (job.schedule?.expr || job.schedule?.at || JSON.stringify(job.schedule))
                              }</code>
                              {job.lastRunAt && (
                                <span className="cron-last-run">
                                  Last run: {new Date(job.lastRunAt).toLocaleDateString()} {new Date(job.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            className="cron-delete-btn"
                            onClick={() => handleDeleteCron(job.id, job.name)}
                            title="Delete cron job"
                          >
                            <Trash2 size={16} />
                          </button>
                        </Card>
                      ))}
                      
                      <div className="fab-container">
                        <Button className="create-cron-pill" onClick={() => handleNewCron()}>
                            <Plus size={16} /> Create New Job
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="cron-templates-view">
                   <div className="templates-grid">
                      {predefinedCrons.map((template, idx) => (
                        <Card key={idx} className="template-card" hoverable onClick={() => {
                           handleNewCron({
                              name: template.title,
                              schedule: template.schedule,
                              text: template.text
                           });
                        }}>
                           <div className="template-header">
                              <div className="template-icon">{template.icon}</div>
                              <h4>{template.title}</h4>
                           </div>
                           <p>{template.description}</p>
                        </Card>
                      ))}
                   </div>
                   
                   <div className="fab-container">
                      <Button className="create-cron-pill" onClick={() => handleNewCron()}>
                          Create Custom Job
                      </Button>
                   </div>
                </div>
              )}
            </div>
          )}

          {/* Usage Tab */}
          {activeTab === 'usage' && (
            <div className="usage-tab">
              <div className="section-label"><Calendar size={14} style={{ marginRight: '6px' }} /> Last 30 Days</div>
              <div className="usage-grid">
                {loadingUsage ? (
                  <div className="loading-state" style={{ gridColumn: '1 / -1' }}>
                    <Loader2 size={24} className="spin" />
                    <span>Calculating usage...</span>
                  </div>
                ) : usageError ? (
                  <div className="error-state" style={{ gridColumn: '1 / -1' }}>
                    <AlertCircle size={24} />
                    <span>{usageError}</span>
                    <Button size="sm" variant="secondary" onClick={fetchUsage}>Retry</Button>
                  </div>
                ) : usageData ? (
                  <>
                    <Card className={`usage-card ${updatedFields.has('messagesThisMonth') ? 'updated' : ''}`}>
                      <div className="usage-icon"><Zap size={20} /></div>
                      <div className="usage-value">{usageData.messagesThisMonth.toLocaleString()}</div>
                      <div className="usage-label">Messages</div>
                    </Card>
                    <Card className={`usage-card ${updatedFields.has('tokensUsed') ? 'updated' : ''}`}>
                      <div className="usage-icon tokens"><BarChart3 size={20} /></div>
                      <div className="usage-value">{formatTokens(usageData.tokensUsed)}</div>
                      <div className="usage-label">Tokens Used</div>
                    </Card>
                    <Card className={`usage-card ${updatedFields.has('costThisMonth') ? 'updated' : ''}`}>
                      <div className="usage-icon credits"><Activity size={20} /></div>
                      <div className="usage-value">${Number(usageData.costThisMonth).toFixed(4)}</div>
                      <div className="usage-label">Total Cost</div>
                    </Card>
                    <Card className={`usage-card ${updatedFields.has('apiCreditsLeft') ? 'updated' : ''}`}>
                      <div className="usage-icon uptime"><Zap size={20} /></div>
                      <div className="usage-value">${Number(usageData.apiCreditsLeft ?? 0).toFixed(2)}</div>
                      <div className="usage-label">Credits Left</div>
                    </Card>

                    {usageData.byModel && usageData.byModel.length > 0 && (
                      <div className="model-usage-section">
                        <div className="section-label" style={{ marginTop: '2rem' }}>Breakdown by Model</div>
                        <div className="model-usage-list">
                          {usageData.byModel.map((item: any, idx: number) => (
                            <Card key={idx} className="model-usage-item">
                              <div className="model-info">
                                <span className="model-name">{item.model}</span>
                                <span className="model-provider">{item.provider}</span>
                              </div>
                              <div className="model-stats">
                                <div className="model-stat">
                                  <span className="stat-value">{formatTokens(item.totals.totalTokens)}</span>
                                  <span className="stat-label">Tokens</span>
                                </div>
                                <div className="model-stat">
                                  <span className="stat-value">${Number(item.totals.totalCost).toFixed(4)}</span>
                                  <span className="stat-label">Cost</span>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : null}

              {/* Top-up section — only for subscribed users */}
              {billingCredits && ['basic', 'guardian', 'fortress'].includes(billingCredits.plan) && (
              <div className="topup-section">
                <div className="section-label" style={{ marginTop: '2rem' }}>Top Up Credits</div>
                <div className="topup-grid">
                  {[
                    { pack: '5',  label: '$5',  credits: 5  },
                    { pack: '10', label: '$10', credits: 10 },
                    { pack: '25', label: '$25', credits: 25 },
                    { pack: '50', label: '$50', credits: 50 },
                  ].map(({ pack, label, credits }) => (
                    <Card key={pack} className="topup-card" hoverable onClick={() => !toppingUp && handleTopup(pack)}>
                      <div className="topup-amount">{label}</div>
                      <div className="topup-credits">+${credits} credits</div>
                      <Button
                        variant="secondary"
                        size="sm"
                        fullWidth
                        disabled={!!toppingUp}
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleTopup(pack); }}
                      >
                        {toppingUp === pack ? <><Loader2 size={13} className="spin" /> Redirecting...</> : 'Top Up'}
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
              )}
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div className="billing-tab">
              {billingLoading ? (
                <div className="loading-state">
                  <Loader2 size={24} className="spin" />
                  <span>Loading billing info...</span>
                </div>
              ) : billingCredits ? (() => {
                const plan = billingCredits.plan;
                const isActive = ['basic', 'guardian', 'fortress'].includes(plan);
                const planName = PLAN_DISPLAY[plan];
                const creditsLeft = Number(billingCredits.api_credits ?? 0);
                const creditsCap = Number(billingCredits.api_credits_cap ?? 0);
                const creditsPct = creditsCap > 0 ? Math.min(100, Math.max(0, (creditsLeft / creditsCap) * 100)) : 0;
                const renewsAt = billingCredits.subscription_renews_at
                  ? new Date(billingCredits.subscription_renews_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : null;
                const planData = [
                  { name: 'Base',     tagline: 'Get started',      price: '$50',  features: ['AI on Telegram, Discord & Slack', '$20 AI credit/mo included', 'Your own always-on assistant'] },
                  { name: 'Guardian', tagline: 'For daily use',     price: '$75',  features: ['Everything in Base', '$35 AI credit/mo included', 'Handles longer, complex tasks', 'Private — no public IP'], isPopular: true },
                  { name: 'Fortress', tagline: 'Maximum privacy',   price: '$100', features: ['Everything in Guardian', '$55 AI credit/mo included', 'Custom server setup', 'Fully air-gapped'] },
                ];
                return isActive ? (
                  <>
                    <Card className="bt-plan-card">
                      <div className="bt-plan-header">
                        <div>
                          <div className="bt-plan-label">Current Plan</div>
                          <div className="bt-plan-name">{planName}</div>
                        </div>
                        <div className="bt-status-badge active">Active</div>
                      </div>
                      <div className="bt-credits-bar-wrap">
                        <div className="bt-credits-bar-top">
                          <span className="bt-credits-label">API Credits</span>
                          <span className="bt-credits-value">${creditsLeft.toFixed(2)} remaining</span>
                        </div>
                        <div className="bt-bar-track">
                          <div className="bt-bar-fill" style={{ width: `${creditsPct}%` }} />
                        </div>
                      </div>
                      <div className="bt-renews">
                        {renewsAt ? `Renews ${renewsAt}` : 'Renews monthly'}
                      </div>
                      <Button variant="secondary" onClick={handleManageSubscription} disabled={openingPortal}>
                        {openingPortal
                          ? <><Loader2 size={14} className="spin" /> Opening...</>
                          : <><Zap size={14} /> Manage Subscription</>}
                      </Button>
                    </Card>

                    <div className="section-label" style={{ marginTop: '2rem' }}>Top Up Credits</div>
                    <div className="topup-grid">
                      {[
                        { pack: '5',  label: '$5',  credits: 5  },
                        { pack: '10', label: '$10', credits: 10 },
                        { pack: '25', label: '$25', credits: 25 },
                        { pack: '50', label: '$50', credits: 50 },
                      ].map(({ pack, label, credits }) => (
                        <Card key={pack} className="topup-card" hoverable onClick={() => !toppingUp && handleTopup(pack)}>
                          <div className="topup-amount">{label}</div>
                          <div className="topup-credits">+${credits} credits</div>
                          <Button variant="secondary" size="sm" fullWidth disabled={!!toppingUp}
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleTopup(pack); }}>
                            {toppingUp === pack ? <><Loader2 size={13} className="spin" /> Redirecting...</> : 'Top Up'}
                          </Button>
                        </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bt-plans-header">
                      <h2>Pick a plan that fits your life</h2>
                      <p>Billed monthly · Cancel anytime</p>
                    </div>
                    <div className="bt-plan-grid">
                      {planData.map((p) => (
                        <Card key={p.name}
                          className={`bt-plan-item${p.isPopular ? ' popular' : ''}${subscribing ? ' disabled' : ''}`}
                          onClick={() => !subscribing && handleSubscribe(p.name)}
                        >
                          {p.isPopular && <div className="bt-popular-badge">Most Popular</div>}
                          <div className="bt-item-top">
                            <div className="bt-item-name">{p.name}</div>
                            <div className="bt-item-tagline">{p.tagline}</div>
                          </div>
                          <div className="bt-item-price">{p.price}<span className="bt-period">/mo</span></div>
                          <ul className="bt-item-features">
                            {p.features.map((f, i) => (
                              <li key={i}><Check size={13} style={{ color: '#27C93F', flexShrink: 0, marginTop: '1px' }} />{f}</li>
                            ))}
                          </ul>
                          <Button variant={p.isPopular ? 'primary' : 'secondary'} fullWidth disabled={!!subscribing}
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleSubscribe(p.name); }}>
                            {subscribing === p.name
                              ? <><Loader2 size={14} className="spin" /> Redirecting...</>
                              : 'Get Started →'}
                          </Button>
                        </Card>
                      ))}
                    </div>
                  </>
                );
              })() : null}
            </div>
          )}
        </div>
      </main>

      {/* Channel Setup Modal */}
      {setupChannel && (
        <ChannelSetupModal
          channel={setupChannel}
          onClose={handleModalClose}
          resumeData={channelResumeData ?? undefined}
        />
      )}

      {/* Cron Setup Modal */}
      {showCronModal && (
        <CronSetupModal
          onClose={() => setShowCronModal(false)}
          onSuccess={() => {
            // Silent refresh — no loading spinner
            getCronJobs().then(setCronJobs).catch(() => {});
          }}
          initialValues={initialCronValues}
        />
      )}
    </div>
  );
};
