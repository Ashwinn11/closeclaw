import { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { createCronJob } from '../../lib/api';
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
      setError(err.message || 'Failed to create cron job');
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
            <button className="light red" onClick={onClose}></button>
            <div className="light yellow"></div>
            <div className="light green"></div>
          </div>
          <div className="titlebar-center">
            <div className="titlebar-icon"><Clock size={16} /></div>
            <span className="titlebar-title">New Scheduled Task</span>
          </div>
        </div>

        <div className="token-step">
          <div className="token-left">
            <h4>Scheduling Tips</h4>
            <ul className="setup-instructions">
              <li>Use <b>Standard Cron</b> syntax (e.g., <code>0 9 * * *</code> for 9am daily).</li>
              <li><b>Timezone:</b> Tasks run in the agent's local system time (UTC by default).</li>
              <li><b>Payload:</b> The agent will process your instruction as if you typed it in chat.</li>
              <li><b>Target:</b> Tasks run in the <code>main</code> session context by default.</li>
            </ul>
            
            <div className="cron-preview-info">
              <div className="info-icon"><AlertCircle size={14} /></div>
              <p>Your agent must be running to execute scheduled tasks.</p>
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
                <label htmlFor="cron-schedule">Schedule (Cron Expr)</label>
                <input
                  id="cron-schedule"
                  type="text"
                  placeholder="0 9 * * *"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="cron-text">Agent Instruction</label>
                <textarea
                  id="cron-text"
                  placeholder="What should the agent do at this time?"
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
      </Card>
    </div>
  );
};
