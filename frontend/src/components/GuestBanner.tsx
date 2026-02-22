import { useState, useEffect, useRef } from 'react';
import { Shield, X, LogOut } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

interface GuestBannerProps {
    onLeave?: () => void;
}

/**
 * Displays a banner when the current user is a guest on someone else's AI session.
 * Polls every 15s to detect if admin revokes access.
 */
export default function GuestBanner({ onLeave }: GuestBannerProps) {
    const [adminName, setAdminName] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [visible, setVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const checkStatus = () => {
            api.getGuestStatus().then(status => {
                if (status.isGuest) {
                    setAdminName(status.adminName || 'Unknown');
                    setAdminEmail(status.adminEmail || '');
                    setVisible(true);
                } else {
                    // Access was revoked — hide the banner
                    if (visible) {
                        setVisible(false);
                        toast('Your shared AI session has ended.', { icon: '🔒' });
                    }
                }
            }).catch(() => { });
        };

        checkStatus();

        // Poll every 15 seconds to detect revocation
        intervalRef.current = setInterval(checkStatus, 15000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    if (!visible || dismissed) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'linear-gradient(135deg, rgba(124, 92, 252, 0.95) 0%, rgba(52, 211, 153, 0.95) 100%)',
            color: '#fff',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontSize: '0.82rem',
            fontWeight: 500,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
            flexWrap: 'wrap' as const,
        }}>
            <Shield size={16} style={{ flexShrink: 0 }} />
            <span style={{ textAlign: 'center' }}>
                Using AI session of: <strong>{adminName}</strong>
                {adminEmail && <span style={{ opacity: 0.8, marginLeft: 4 }}>({adminEmail})</span>}
            </span>
            <button
                onClick={async () => {
                    try {
                        await api.leaveSession();
                        setVisible(false);
                        if (intervalRef.current) clearInterval(intervalRef.current);
                        toast.success('Left the shared session. You can set up your own API key in Settings.');
                        onLeave?.();
                    } catch { /* ignore */ }
                }}
                style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    color: '#fff',
                    padding: '4px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    flexShrink: 0,
                }}
            >
                <LogOut size={12} /> Leave
            </button>
            <button
                onClick={() => setDismissed(true)}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    flexShrink: 0,
                }}
            >
                <X size={16} />
            </button>
        </div>
    );
}
