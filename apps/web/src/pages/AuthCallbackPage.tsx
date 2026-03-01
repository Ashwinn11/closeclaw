import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import './AuthCallbackPage.css';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(() => {
    // Check for error in URL params (Supabase puts errors in hash or query)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);

    const errorMsg =
      hashParams.get('error_description') ||
      queryParams.get('error_description') ||
      hashParams.get('error') ||
      queryParams.get('error');

    return errorMsg ? decodeURIComponent(errorMsg) : null;
  });

  useEffect(() => {
    if (error) return;

    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (isActive) {
        setError('Sign-in timed out. Please try again.');
      }
    }, 12000);

    const resolveSession = async () => {
      const { data: initialData } = await supabase.auth.getSession();
      if (initialData.session && isActive) {
        navigate('/dashboard', { replace: true });
        return;
      }

      // Handle PKCE callback explicitly when `code` is present.
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError && isActive) {
          setError(exchangeError.message || 'Authentication failed. Please try again.');
          return;
        }
      }

      // Redirect immediately if a session already exists.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError && isActive) {
        setError(sessionError.message || 'Authentication failed. Please try again.');
        return;
      }
      if (data.session && isActive) {
        navigate('/dashboard', { replace: true });
      }
    };

    void resolveSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isActive) return;
      if (session) {
        window.clearTimeout(timeoutId);
        navigate('/dashboard', { replace: true });
      }
    });

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [navigate, error]);

  return (
    <div className="login-page">
      <NebulaBackground />
      <div className="login-card" style={{ zIndex: 2 }}>
        {error ? (
          <>
            <div className="login-logo">
              <img src="/logo.png" alt="CloseClaw Logo" className="logo-icon" style={{ marginBottom: '1rem' }} />
            </div>
            <div className="login-error">
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
            <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
              ← Back to Home
            </Button>
          </>
        ) : (
          <>
            <div className="login-logo">
              <img src="/logo.png" alt="CloseClaw Logo" className="logo-icon" style={{ marginBottom: '1rem' }} />
            </div>
            <Loader2 size={32} className="spin" style={{ color: 'var(--text-secondary)', margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Completing sign in...</p>
          </>
        )}
      </div>
    </div>
  );
};
