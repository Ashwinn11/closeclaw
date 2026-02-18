import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BrandIcons } from '../components/ui/BrandIcons';
import { ChannelSetupModal } from '../components/ui/ChannelSetupModal';
import { listChannels, disconnectChannel, type ChannelConnection } from '../lib/api';
import {
  LogOut, Wifi, WifiOff, Clock, BarChart3,
  Plus, MoreHorizontal, Activity, Zap, Loader2,
} from 'lucide-react';
import './DashboardPage.css';

type Tab = 'connections' | 'cron' | 'usage';
type ChannelType = 'Telegram' | 'Discord' | 'Slack';

interface ChannelDef {
  name: ChannelType;
  key: string; // lowercase key used in DB
  icon: React.FC;
  color: string;
}

const channelDefs: ChannelDef[] = [
  { name: 'Telegram', key: 'telegram', icon: BrandIcons.Telegram, color: '#2AABEE' },
  { name: 'Discord', key: 'discord', icon: BrandIcons.Discord, color: '#5865F2' },
  { name: 'Slack', key: 'slack', icon: BrandIcons.Slack, color: '#E01E5A' },
];

const upcomingChannels = [
  { name: 'WhatsApp', color: '#25D366' },
  { name: 'Signal', color: '#3A76F0' },
  { name: 'iMessage', color: '#34C759' },
  { name: 'Matrix', color: '#0DBD8B' },
];

const mockCronJobs = [
  { id: 1, name: 'Daily Digest', schedule: '0 9 * * *', status: 'active', lastRun: '2h ago' },
  { id: 2, name: 'Weekly Report', schedule: '0 8 * * 1', status: 'active', lastRun: '3d ago' },
  { id: 3, name: 'Cache Cleanup', schedule: '0 */6 * * *', status: 'paused', lastRun: '6h ago' },
];

const mockUsageData = {
  messagesThisMonth: 2847,
  tokensUsed: '1.2M',
  apiCreditsLeft: '$18.40',
  uptime: '99.97%',
};

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('connections');
  const [setupChannel, setSetupChannel] = useState<ChannelType | null>(null);
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    try {
      const data = await listChannels();
      setConnections(data);
    } catch {
      // API might not be running — show empty state
      setConnections([]);
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const getChannelStatus = (key: string): { status: 'active' | 'pending' | 'inactive'; connectionId?: string } => {
    const conn = connections.find(c => c.channel === key && (c.status === 'active' || c.status === 'pending'));
    if (conn) return { status: conn.status as 'active' | 'pending', connectionId: conn.id };
    return { status: 'inactive' };
  };

  const handleDisconnect = async (connectionId: string) => {
    setDisconnecting(connectionId);
    try {
      await disconnectChannel(connectionId);
      await fetchChannels(); // Refresh
    } catch {
      // Ignore errors for now
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
      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
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
          <div className="server-status">
            <span className="status-dot online" />
            <span>Server Online</span>
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
                          <button className="channel-menu"><MoreHorizontal size={16} /></button>
                        </div>
                        <h3>{ch.name}</h3>
                        <div className="channel-status">
                          {status === 'active' ? (
                            <><Wifi size={14} /> <span className="connected">Connected</span></>
                          ) : status === 'pending' ? (
                            <><Loader2 size={14} className="spin" /> <span className="pending">Provisioning...</span></>
                          ) : (
                            <><WifiOff size={14} /> <span className="disconnected">Not Connected</span></>
                          )}
                        </div>
                        {status === 'active' || status === 'pending' ? (
                          <Button
                            className="channel-action-btn"
                            variant="ghost"
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
              <div className="upcoming-grid">
                {upcomingChannels.map((ch) => (
                  <div key={ch.name} className="upcoming-card">
                    <div className="upcoming-dot" style={{ background: ch.color }} />
                    <span>{ch.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cron Tab */}
          {activeTab === 'cron' && (
            <div className="cron-tab">
              <div className="cron-header">
                <div className="section-label">Scheduled Jobs</div>
                <Button size="sm" className="add-cron-btn">
                  <Plus size={14} /> New Job
                </Button>
              </div>
              <div className="cron-list">
                {mockCronJobs.map((job) => (
                  <Card key={job.id} className="cron-card">
                    <div className="cron-info">
                      <div className="cron-name-row">
                        <Activity size={16} className={job.status === 'active' ? 'cron-active' : 'cron-paused'} />
                        <h4>{job.name}</h4>
                        <span className={`cron-status-badge ${job.status}`}>{job.status}</span>
                      </div>
                      <div className="cron-meta">
                        <code>{job.schedule}</code>
                        <span className="cron-last-run">Last run: {job.lastRun}</span>
                      </div>
                    </div>
                    <button className="channel-menu"><MoreHorizontal size={16} /></button>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Usage Tab */}
          {activeTab === 'usage' && (
            <div className="usage-tab">
              <div className="section-label">This Month</div>
              <div className="usage-grid">
                <Card className="usage-card">
                  <div className="usage-icon"><Zap size={20} /></div>
                  <div className="usage-value">{mockUsageData.messagesThisMonth.toLocaleString()}</div>
                  <div className="usage-label">Messages Processed</div>
                </Card>
                <Card className="usage-card">
                  <div className="usage-icon tokens"><BarChart3 size={20} /></div>
                  <div className="usage-value">{mockUsageData.tokensUsed}</div>
                  <div className="usage-label">Tokens Used</div>
                </Card>
                <Card className="usage-card">
                  <div className="usage-icon credits"><Activity size={20} /></div>
                  <div className="usage-value">{mockUsageData.apiCreditsLeft}</div>
                  <div className="usage-label">API Credits Remaining</div>
                </Card>
                <Card className="usage-card">
                  <div className="usage-icon uptime"><Wifi size={20} /></div>
                  <div className="usage-value">{mockUsageData.uptime}</div>
                  <div className="usage-label">Uptime</div>
                </Card>
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
    </div>
  );
};
