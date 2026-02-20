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
import { listChannels, disconnectChannel, type ChannelConnection, getCronJobs, getUsageStats, removeCronJob, patchGatewayConfig } from '../lib/api';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import {
  LogOut, Wifi, WifiOff, Clock, BarChart3,
  Plus, Activity, Zap, Loader2, AlertCircle, Calendar, Trash2, Smartphone, ArrowRight, Sun, Receipt, TrendingDown, Server, MessageCircle
} from 'lucide-react';
import './DashboardPage.css';

type Tab = 'connections' | 'cron' | 'usage';
type ChannelType = 'Telegram' | 'Discord' | 'Slack';

interface ChannelDef {
  name: ChannelType;
  key: string; // lowercase key used in DB
  icon: React.FC;
  color: string;
  description: string;
}

const channelDefs: ChannelDef[] = [
  { name: 'Telegram', key: 'telegram', icon: BrandIcons.Telegram, color: '#2AABEE', description: 'Bot API via grammY; supports groups' },
  { name: 'Discord', key: 'discord', icon: BrandIcons.Discord, color: '#5865F2', description: 'Servers, channels, and DMs' },
  { name: 'Slack', key: 'slack', icon: BrandIcons.Slack, color: '#E01E5A', description: 'Bolt SDK; workspace apps' },
];

const upcomingChannels = [
  { name: 'WhatsApp', color: '#25D366', description: 'Uses Baileys; requires QR pairing', icon: BrandIcons.WhatsApp },
  { name: 'Signal', color: '#3A76F0', description: 'Privacy-focused via signal-cli', icon: BrandIcons.Signal },
  { name: 'iMessage', color: '#34C759', description: 'Via BlueBubbles macOS server', icon: BrandIcons.iMessage },
  { name: 'Matrix', color: '#0DBD8B', description: 'Federated Synapse protocol', icon: BrandIcons.Matrix },
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
      const data = await getUsageStats();
      setUsageData(data);
    } catch (err: any) {
      setUsageError(err.message || 'Failed to fetch usage data');
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
        getUsageStats()
          .then(data => {
            setUsageData(data);
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
    fetchChannels(); // Refresh connections after modal closes
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'connections', label: 'Connections', icon: <Wifi size={16} /> },
    { key: 'cron', label: 'Cron', icon: <Clock size={16} /> },
    { key: 'usage', label: 'Usage', icon: <BarChart3 size={16} /> },
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
              {activeTab === 'connections' && 'Manage your channel connections'}
              {activeTab === 'cron' && 'Schedule and manage automated tasks'}
              {activeTab === 'usage' && 'Monitor your agent\'s performance'}
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
                 <span><span className="highlight">Pro tip:</span> Cron jobs deliver alerts straight to Telegram or WhatsApp — connect a channel for the best experience.</span>
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
                       <h3>No cron jobs yet</h3>
                       <p>Set up automated tasks — just tell your bot what to do and when</p>
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
                      <div className="usage-value">{(usageData.tokensUsed / 1000).toFixed(1)}k</div>
                      <div className="usage-label">Tokens Used</div>
                    </Card>
                    <Card className={`usage-card ${updatedFields.has('costThisMonth') ? 'updated' : ''}`}>
                      <div className="usage-icon credits"><Activity size={20} /></div>
                      <div className="usage-value">${Number(usageData.costThisMonth).toFixed(4)}</div>
                      <div className="usage-label">Total Cost</div>
                    </Card>
                    <Card className={`usage-card ${updatedFields.has('uptime') ? 'updated' : ''}`}>
                      <div className="usage-icon uptime"><Wifi size={20} /></div>
                      <div className="usage-value">{usageData.uptime}</div>
                      <div className="usage-label">Uptime</div>
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
                                  <span className="stat-value">{(item.totals.totalTokens / 1000).toFixed(1)}k</span>
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
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Channel Setup Modal */}
      {setupChannel && (
        <ChannelSetupModal
          channel={setupChannel}
          onClose={handleModalClose}
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
