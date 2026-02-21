import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { getCredits, getBillingPortal, createCheckout, createTopup } from '../lib/api';
import { ArrowLeft, Check, Loader2, AlertCircle, ExternalLink, Zap } from 'lucide-react';
import './BillingPage.css';

const PLAN_DISPLAY: Record<string, string> = {
  basic: 'Base',
  guardian: 'Guardian',
  fortress: 'Fortress',
};

const PLAN_INITIAL_CREDITS: Record<string, number> = {
  basic: 20,
  guardian: 35,
  fortress: 55,
};

const planData = [
  {
    name: 'Base',
    price: '$50',
    features: ['Dedicated VM', '$20 API credits/mo', 'Secure mesh network'],
  },
  {
    name: 'Guardian',
    price: '$75',
    features: ['High-memory VM', '$35 API credits/mo', 'Ghost Mesh (no public IP)'],
    isPopular: true,
  },
  {
    name: 'Fortress',
    price: '$100',
    features: ['Custom infra', '$55 API credits/mo', 'Air-gapped gateway'],
  },
];

export const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<{ api_credits: number; plan: string } | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
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
  const isActive = ['basic', 'guardian', 'fortress'].includes(plan);
  const planDisplayName = PLAN_DISPLAY[plan] ?? null;
  const initialCredits = PLAN_INITIAL_CREDITS[plan] ?? 0;
  const creditsLeft = Number(credits?.api_credits ?? 0);
  const creditsCap = Number(credits?.api_credits_cap ?? 0);
  const creditsPct = creditsCap > 0
    ? Math.min(100, Math.max(0, (creditsLeft / creditsCap) * 100))
    : 0;
  const renewsAt = credits?.subscription_renews_at
    ? new Date(credits.subscription_renews_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const handleManageSubscription = async () => {
    setOpeningPortal(true);
    setError(null);
    try {
      const { portalUrl } = await getBillingPortal();
      window.open(portalUrl, '_blank');
    } catch (err: any) {
      setError(err.message || 'Portal unavailable. Please try again.');
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleTopup = async (pack: string) => {
    setToppingUp(pack);
    setError(null);
    try {
      const { checkoutUrl } = await createTopup(pack);
      window.location.href = checkoutUrl;
    } catch (err: any) {
      setError(err.message || 'Failed to create checkout');
      setToppingUp(null);
    }
  };

  const handleSubscribe = async (planName: string) => {
    setSubscribing(planName);
    setError(null);
    try {
      const { checkoutUrl } = await createCheckout(planName);
      window.location.href = checkoutUrl;
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
          <h1>Billing</h1>
          <p>Manage your subscription and credits</p>
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
            {/* Current Plan Card */}
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

              <div className="plan-actions">
                <Button
                  variant="secondary"
                  onClick={handleManageSubscription}
                  disabled={openingPortal}
                >
                  {openingPortal
                    ? <><Loader2 size={14} className="billing-spin" /> Opening...</>
                    : <><ExternalLink size={14} /> Manage Subscription</>}
                </Button>
              </div>
            </Card>

            {/* Top-up section */}
            <div className="billing-topup-section">
              <div className="billing-section-label">
                <Zap size={14} />
                Top Up Credits
              </div>
              <div className="billing-topup-grid">
                {[
                  { pack: '5',  label: '$5',  amount: 5  },
                  { pack: '10', label: '$10', amount: 10 },
                  { pack: '25', label: '$25', amount: 25 },
                  { pack: '50', label: '$50', amount: 50 },
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
          // No active subscription — show plan selection
          <>
            <div className="billing-plans-header">
              <h2>Choose a plan</h2>
              <p>Billed monthly · Cancel anytime</p>
            </div>

            <div className="billing-plan-list">
              {planData.map((p) => (
                <Card
                  key={p.name}
                  className={`billing-plan-row${p.isPopular ? ' popular' : ''}${subscribing ? ' disabled' : ''}`}
                  onClick={() => !subscribing && handleSubscribe(p.name)}
                >
                  <div className="plan-row-left">
                    <div className="plan-row-name">
                      {p.name}
                      {p.isPopular && <span className="bpr-popular-tag">POPULAR</span>}
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
                      variant={p.isPopular ? 'primary' : 'secondary'}
                      disabled={!!subscribing}
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleSubscribe(p.name); }}
                    >
                      {subscribing === p.name
                        ? <><Loader2 size={14} className="billing-spin" /> Redirecting...</>
                        : 'Get Started →'}
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
