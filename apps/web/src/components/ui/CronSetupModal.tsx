import { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { createCronJob } from '../../lib/api';
import { useError } from '../../context/ErrorContext';
import { Loader2, AlertCircle, Clock, Send } from 'lucide-react';
import './CronSetupModal.css';

const PRESETS = [
  { label: 'Daily 9am',    expr: '0 9 * * *'   },
  { label: 'Weekdays 8am', expr: '0 8 * * 1-5' },
  { label: 'Every Monday', expr: '0 9 * * 1'   },
  { label: 'Every hour',   expr: '0 * * * *'   },
  { label: 'Monthly 1st',  expr: '0 9 1 * *'   },
];

const FIELD_NAMES = ['minute', 'hour', 'day-of-month', 'month', 'weekday'];
const FIELD_RANGES: [number, number][] = [[0,59],[0,23],[1,31],[1,12],[0,7]];

function isValidField(part: string, min: number, max: number): boolean {
  if (part === '*') return true;
  if (/^\*\/\d+$/.test(part)) { const n = parseInt(part.slice(2)); return n > 0 && n <= max; }
  if (/^\d+-\d+$/.test(part)) { const [a,b] = part.split('-').map(Number); return a >= min && b <= max && a <= b; }
  if (/^\d+-\d+\/\d+$/.test(part)) { const [range,step] = part.split('/'); const [a,b] = range.split('-').map(Number); return a >= min && b <= max && parseInt(step) > 0; }
  if (part.includes(',')) return part.split(',').every(p => { const n = parseInt(p); return !isNaN(n) && n >= min && n <= max; });
  const n = parseInt(part);
  return !isNaN(n) && n >= min && n <= max;
}

function validateCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return `Expected 5 fields, got ${parts.length} (minute hour day month weekday)`;
  for (let i = 0; i < 5; i++) {
    if (!isValidField(parts[i], FIELD_RANGES[i][0], FIELD_RANGES[i][1]))
      return `Invalid ${FIELD_NAMES[i]}: "${parts[i]}"`;
  }
  return null;
}

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return '';
  const [min, hour, dom, , dow] = parts;

  const fmt = (h: string, m: string) => {
    if (h === '*') return null;
    const hn = parseInt(h), mn = parseInt(m === '*' ? '0' : m);
    const period = hn >= 12 ? 'PM' : 'AM';
    const h12 = hn % 12 || 12;
    return mn === 0 ? `${h12}${period}` : `${h12}:${String(mn).padStart(2, '0')}${period}`;
  };

  const time = fmt(hour, min);
  const DAY: Record<string, string> = {
    '0': 'Sundays', '7': 'Sundays', '1': 'Mondays', '2': 'Tuesdays',
    '3': 'Wednesdays', '4': 'Thursdays', '5': 'Fridays',
    '6': 'Saturdays', '1-5': 'Weekdays', '0,6': 'Weekends', '6,0': 'Weekends',
  };

  if (dow === '*' && dom === '*') {
    if (hour === '*') return 'Runs every hour';
    return time ? `Runs every day at ${time}` : '';
  }
  if (dom === '*' && dow !== '*') {
    const day = DAY[dow] ?? `day ${dow}`;
    return time ? `Runs every ${day} at ${time}` : `Runs every ${day}`;
  }
  if (dom !== '*' && dow === '*') {
    return time ? `Runs monthly on day ${dom} at ${time}` : `Runs monthly on day ${dom}`;
  }
  return '';
}

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
  const [fields, setFields] = useState<string[]>(() => {
    const p = (initialValues?.schedule || '0 9 * * *').trim().split(/\s+/);
    while (p.length < 5) p.push('*');
    return p.slice(0, 5);
  });
  const [text, setText] = useState(initialValues?.text || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showError } = useError();

  // Derive the schedule string, substituting '*' for empty fields
  const schedule = fields.map(f => f.trim() || '*').join(' ');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !text.trim()) {
      setError('Please fill in all fields');
      return;
    }
    const cronErr = validateCron(schedule);
    if (cronErr) { setError(`Invalid schedule: ${cronErr}`); return; }

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
              <li>Pick a schedule using the quick presets or type a custom cron expression (e.g. <code>0 9 * * *</code> = every day at 9am).</li>
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
                <label>When should this run?</label>
                <div className="cron-presets">
                  {PRESETS.map((p) => (
                    <button
                      key={p.expr}
                      type="button"
                      className={`cron-preset-chip ${schedule === p.expr ? 'active' : ''}`}
                      onClick={() => setFields(p.expr.split(' '))}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="cron-fields">
                  {([
                    { label: 'Minute',  placeholder: '0', index: 0, hint: '0–59'  },
                    { label: 'Hour',    placeholder: '9', index: 1, hint: '0–23'  },
                    { label: 'Day',     placeholder: '*', index: 2, hint: '1–31'  },
                    { label: 'Month',   placeholder: '*', index: 3, hint: '1–12'  },
                    { label: 'Weekday', placeholder: '*', index: 4, hint: '0=Sun' },
                  ] as const).map(({ label, placeholder, index, hint }) => {
                    const val = fields[index] ?? '*';
                    const effective = val.trim() || '*';
                    const invalid = val.trim() !== '' && !isValidField(effective, FIELD_RANGES[index][0], FIELD_RANGES[index][1]);
                    return (
                      <div key={label} className={`cron-field${invalid ? ' cron-field--invalid' : ''}`}>
                        <input
                          type="text"
                          value={val}
                          placeholder={placeholder}
                          onChange={(e) => {
                            setFields(prev => {
                              const next = [...prev];
                              next[index] = e.target.value;
                              return next;
                            });
                          }}
                        />
                        <span className="cron-field-name">{label}</span>
                        <span className="cron-field-hint">{hint}</span>
                      </div>
                    );
                  })}
                </div>
                {schedule.trim() && (() => {
                  const err = validateCron(schedule);
                  if (err) return <span className="cron-feedback cron-feedback--error">{err}</span>;
                  const desc = describeCron(schedule);
                  if (desc) return <span className="cron-feedback cron-feedback--ok">{desc}</span>;
                })()}
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
