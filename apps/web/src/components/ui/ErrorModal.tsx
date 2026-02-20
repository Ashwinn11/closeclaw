import { type FC, type MouseEvent } from 'react';
import { AlertCircle } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import './ErrorModal.css';

interface ErrorModalProps {
  message: string;
  onClose: () => void;
  title?: string;
}

export const ErrorModal: FC<ErrorModalProps> = ({ message, onClose, title = 'Error' }) => {
  return (
    <div className="error-modal-overlay" onClick={onClose}>
      <Card className="error-modal" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <div className="error-titlebar">
          <div className="traffic-lights">
            <button className="light red" onClick={onClose} aria-label="Close">
              <svg width="6" height="6" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z" fill="currentColor"/>
              </svg>
            </button>
            <button className="light yellow" onClick={onClose} aria-label="Minimize">
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
          <div className="error-titlebar-center">
            <span className="error-titlebar-title">{title}</span>
          </div>
        </div>

        <div className="error-modal-content">
          <div className="error-icon-wrapper">
            <AlertCircle size={28} />
          </div>
          <p className="error-message">{message}</p>
          <div className="error-modal-actions">
            <Button variant="primary" fullWidth onClick={onClose}>
              Dismiss
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
