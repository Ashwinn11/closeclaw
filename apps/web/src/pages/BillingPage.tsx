import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { getCredits } from '../lib/api';
import { ArrowLeft, Loader2, AlertCircle, Zap, Smartphone } from 'lucide-react';
import { BrandIcons } from '../components/ui/BrandIcons';
import './BillingPage.css';

const PLAN_DISPLAY: Record<string, string> = {
  platform: 'Platform Plan',
};


export const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<{ api_credits: number; plan: string; subscription_renews_at: string | null } | null>(null);
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
  const renewsAt = credits?.subscription_renews_at
    ? new Date(credits.subscription_renews_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;


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
              </div>

              <div className="plan-renews-row">
                {renewsAt ? `Renews ${renewsAt}` : 'Renews monthly'}
              </div>
            </Card>

            <div className="billing-topup-section">
              <div className="billing-section-label">
                <Zap size={14} />
                Billing Management
              </div>
              <Card className="billing-notice-card">
                <Smartphone size={24} className="notice-icon" />
                <div className="notice-content">
                  <h4>Managed on iOS</h4>
                  <p>To ensure the highest level of security and privacy, credit top-ups and subscription management are handled exclusively through the CloseClaw iOS app.</p>
                  <Button variant="secondary" size="sm" onClick={() => window.open('https://apps.apple.com', '_blank')}>
                    Open App Store
                  </Button>
                </div>
              </Card>
            </div>
          </>
        ) : (
          <>
            <div className="billing-plans-header">
              <h2>Private AI Workspace</h2>
              <p>Full access to OpenClaw with zero technical overhead</p>
            </div>

            <div className="billing-plan-list single-plan">
              <Card className="activation-redirect-card">
                <div className="arc-icon"><Smartphone size={40} strokeWidth={1} /></div>
                <h3>Activation Required</h3>
                <p>New environments must be activated and subscribed through our iOS mobile application. Please download CloseClaw on your iPhone to get started.</p>
                <Button variant="primary" onClick={() => window.open('https://apps.apple.com', '_blank')}>
                  <BrandIcons.Apple />
                  <span>Get CloseClaw for iOS</span>
                </Button>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
