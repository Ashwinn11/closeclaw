import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { NebulaBackground } from '../components/ui/NebulaBackground';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import './AuthCallbackPage.css';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for error in URL params (Supabase puts errors in hash or query)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);

    const errorMsg =
      hashParams.get('error_description') ||
      queryParams.get('error_description') ||
      hashParams.get('error') ||
      queryParams.get('error');

    if (errorMsg) {
      setError(decodeURIComponent(errorMsg));
      return;
    }

    // If no error, wait for session to be established then redirect
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/dashboard', { replace: true });
      } else if (event === 'INITIAL_SESSION' && !session) {
        // No session established — something went wrong
        setError('Authentication failed. Please try again.');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="login-page">
      <NebulaBackground />
      <div className="login-card" style={{ zIndex: 2 }}>
        {error ? (
          <>
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
            <Loader2 size={32} className="spin" style={{ color: 'var(--text-secondary)', margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Completing sign in...</p>
          </>
        )}
      </div>
    </div>
  );
};
