import { type FC, type MouseEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import './ConfirmModal.css';

interface ConfirmModalProps {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmModal: FC<ConfirmModalProps> = ({
    title = 'Confirm',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    loading = false,
    onConfirm,
    onCancel,
}) => {
    return (
        <div className="confirm-modal-overlay" onClick={onCancel}>
            <Card className="confirm-modal" onClick={(e: MouseEvent) => e.stopPropagation()}>
                <div className="confirm-titlebar">
                    <div className="traffic-lights">
                        <button className="light red" onClick={onCancel} aria-label="Close">
                            <svg width="6" height="6" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z" fill="currentColor" />
                            </svg>
                        </button>
                        <button className="light yellow" onClick={onCancel} aria-label="Minimize">
                            <svg width="8" height="2" viewBox="0 0 14 2" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 2H0V0H14V2Z" fill="currentColor" />
                            </svg>
                        </button>
                        <button className="light green" aria-label="Zoom">
                            <svg width="6" height="6" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 2H12L8.5 5.5L9.5 6.5L13 3V7H14V0H7V1H8V2ZM6 12H2L5.5 8.5L4.5 7.5L1 11V7H0V14H7V13H6V12Z" fill="currentColor" />
                            </svg>
                        </button>
                    </div>
                    <div className="confirm-titlebar-center">
                        <span className="confirm-titlebar-title">{title}</span>
                    </div>
                </div>

                <div className="confirm-modal-content">
                    <div className={`confirm-icon-wrapper ${danger ? 'danger' : ''}`}>
                        <AlertTriangle size={28} />
                    </div>
                    <p className="confirm-message">{message}</p>
                    <div className="confirm-modal-actions">
                        <Button variant="secondary" fullWidth onClick={onCancel} disabled={loading}>
                            {cancelLabel}
                        </Button>
                        <Button
                            variant="primary"
                            fullWidth
                            onClick={onConfirm}
                            disabled={loading}
                            className={danger ? 'confirm-danger-btn' : ''}
                        >
                            {loading ? 'Processing...' : confirmLabel}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};
