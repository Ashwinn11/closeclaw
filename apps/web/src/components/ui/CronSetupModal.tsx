import { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { createCronJob } from '../../lib/api';
import { useError } from '../../context/ErrorContext';
import { Loader2, AlertCircle, Clock, Send } from 'lucide-react';
import './CronSetupModal.css';

interface CronSetupModalProps {
  onClose: () => void;
  onSuccess: () => void;
  initialValues?: {
    name?: string;
    schedule?: string;
    text?: string;
  };
}

export const CronSetupModal: React.FC<CronSetupModalProps> = ({ onClose, onSuccess, initialValues }) => {
  const [name, setName] = useState(initialValues?.name || '');
  const [schedule, setSchedule] = useState(initialValues?.schedule || '0 9 * * *');
  const [text, setText] = useState(initialValues?.text || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showError } = useError();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !schedule.trim() || !text.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Gateway expects a specific payload structure
      await createCronJob({ 
        name: name.trim(), 
        schedule: { kind: 'cron', expr: schedule.trim() },
        sessionTarget: 'main',
        wakeMode: 'next-heartbeat',
        payload: {
          kind: 'systemEvent',
          text: text.trim()
        }
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to create cron job', 'Creation Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card className="setup-modal cron-setup-modal" onClick={(e) => e.stopPropagation()}>
        {/* macOS Title Bar */}
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
            <div className="titlebar-icon"><Clock size={16} /></div>
            <span className="titlebar-title">Cron Job</span>
            <span className="titlebar-separator">—</span>
            <span className="titlebar-step">Schedule a Task</span>
          </div>
        </div>

        <div className="modal-content">
        <div className="token-step">
          <div className="token-left">
            <h4>How it works</h4>
            <ul className="setup-instructions">
              <li>Give your task a name so you can find it later.</li>
              <li>Pick a schedule using cron format — e.g. <code>0 9 * * *</code> means every day at 9am.</li>
              <li>Write your instruction in plain English, just like you'd type it in chat.</li>
              <li>Your AI will run it automatically at the time you set.</li>
            </ul>

            <div className="cron-preview-info">
              <div className="info-icon"><AlertCircle size={14} /></div>
              <p>Your AI needs to be online for scheduled tasks to run.</p>
            </div>
          </div>

          <div className="token-divider"></div>

          <div className="token-right">
            <form onSubmit={handleSubmit} className="cron-form">
              <div className="form-group">
                <label htmlFor="cron-name">Task Name</label>
                <input
                  id="cron-name"
                  type="text"
                  placeholder="e.g. Daily Market Summary"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="cron-schedule">When should this run?</label>
                <input
                  id="cron-schedule"
                  type="text"
                  placeholder="0 9 * * * — every day at 9am"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="cron-text">What should your AI do?</label>
                <textarea
                  id="cron-text"
                  placeholder="e.g. Summarize today's top news and send it to me"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                />
              </div>

              {error && (
                <div className="token-error">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              <div className="step-actions">
                <Button variant="secondary" onClick={onClose} type="button" disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="deploy-btn">
                  {loading ? (
                    <><Loader2 size={16} className="spin" /> Creating...</>
                  ) : (
                    <><Send size={16} /> Create Task</>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
        </div>
      </Card>
    </div>
  );
};
