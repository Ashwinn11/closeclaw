import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { getCredits } from '../lib/api';
import { ArrowLeft, Check, Loader2, AlertCircle, Zap } from 'lucide-react';
import './BillingPage.css';

const PLAN_DISPLAY: Record<string, string> = {
  platform: 'Platform Plan',
};

const planData = [
  {
    name: 'Platform',
    tagline: 'Full Access & Private Environment',
    price: '$50',
    features: [
      'Dedicated AI on Telegram, Discord & Slack',
      '$20 in AI credits/mo included',
      'Your own private environment, never shared',
      'Zero technical maintenance',
      'Priority platform support',
    ],
  },
];

export const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<{ api_credits: number; plan: string; api_credits_cap: number; subscription_renews_at: string | null } | null>(null);
  const [toppingUp, setToppingUp] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCredits()
      .then(setCredits)
      .catch(() => setError('Failed to load billing information'))
      .finally(() => setLoading(false));
  }, []);

  const plan = credits?.plan ?? 'none';
  const isActive = (plan === 'platform' || plan === 'Platform');

  const planDisplayName = PLAN_DISPLAY[plan] ?? 'Platform Plan';
  const creditsLeft = Number(credits?.api_credits ?? 0);
  const creditsCap = Number(credits?.api_credits_cap ?? 0);
  const creditsPct = creditsCap > 0
    ? Math.min(100, Math.max(0, (creditsLeft / creditsCap) * 100))
    : 0;
  const renewsAt = credits?.subscription_renews_at
    ? new Date(credits.subscription_renews_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const handleTopup = async (pack: string) => {
    setToppingUp(pack);
    setError(null);
    try {
      // Mock topup
      await new Promise(r => setTimeout(r, 1500));
      window.history.replaceState({}, '', '/billing?cc_topup=success');
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Failed to create checkout');
      setToppingUp(null);
    }
  };

  const handleSubscribe = async (planName: string) => {
    setSubscribing(planName);
    setError(null);
    try {
      // Mock checkout
      await new Promise(r => setTimeout(r, 1500));
      window.history.replaceState({}, '', '/billing?cc_setup=resume');
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Failed to create checkout');
      setSubscribing(null);
    }
  };

  return (
    <div className="billing-page">
      <NebulaBackground />
      <div className="billing-content">
        <button className="billing-back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>

        <div className="billing-page-header">
          <h1>Plan & Credits</h1>
          <p>Manage your workspace subscription</p>
        </div>

        {error && (
          <div className="billing-error">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="billing-loading">
            <Loader2 size={32} className="billing-spin" />
          </div>
        ) : isActive && credits ? (
          <>
            <Card className="current-plan-card">
              <div className="cpc-header">
                <div>
                  <div className="cpc-label">Current Plan</div>
                  <div className="cpc-name">{planDisplayName}</div>
                </div>
                <div className="plan-status-badge active">Active</div>
              </div>

              <div className="credits-bar-section">
                <div className="credits-bar-header">
                  <span className="credits-bar-label">API Credits</span>
                  <span className="credits-bar-value">
                    ${creditsLeft.toFixed(2)} remaining
                  </span>
                </div>
                <div className="credits-bar-track">
                  <div className="credits-bar-fill" style={{ width: `${creditsPct}%` }} />
                </div>
              </div>

              <div className="plan-renews-row">
                {renewsAt ? `Renews ${renewsAt}` : 'Renews monthly'}
              </div>
            </Card>

            <div className="billing-topup-section">
              <div className="billing-section-label">
                <Zap size={14} />
                Top Up Credits
              </div>
              <div className="billing-topup-grid">
                {[
                  { pack: '5', label: '$5', amount: 5 },
                  { pack: '10', label: '$10', amount: 10 },
                  { pack: '25', label: '$25', amount: 25 },
                  { pack: '50', label: '$50', amount: 50 },
                  { pack: '100', label: '$100', amount: 100 },
                ].map(({ pack, label, amount }) => (
                  <Card
                    key={pack}
                    className="billing-topup-card"
                    hoverable
                    onClick={() => !toppingUp && handleTopup(pack)}
                  >
                    <div className="topup-amount">{label}</div>
                    <div className="topup-credits">+${amount} credits</div>
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      disabled={!!toppingUp}
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleTopup(pack); }}
                    >
                      {toppingUp === pack
                        ? <><Loader2 size={13} className="billing-spin" /> Redirecting...</>
                        : 'Top Up'}
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="billing-plans-header">
              <h2>Private AI Workspace</h2>
              <p>Full access to OpenClaw with zero technical overhead</p>
            </div>

            <div className="billing-plan-list single-plan">
              {planData.map((p) => (
                <Card
                  key={p.name}
                  className="billing-plan-row popular"
                  onClick={() => !subscribing && handleSubscribe(p.name)}
                >
                  <div className="plan-row-left">
                    <div className="plan-row-name">
                      {p.name} Plan
                      <span className="bpr-popular-tag">RECOMMENDED</span>
                    </div>
                    <ul className="plan-row-features">
                      {p.features.map((f, i) => (
                        <li key={i}><Check size={13} className="check-icon" />{f}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="plan-row-right">
                    <div className="plan-row-price">
                      {p.price}<span className="period">/mo</span>
                    </div>
                    <Button
                      variant="primary"
                      disabled={!!subscribing}
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleSubscribe(p.name); }}
                    >
                      {subscribing === p.name
                        ? <><Loader2 size={14} className="billing-spin" /> Redirecting...</>
                        : 'Get Started Now'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
