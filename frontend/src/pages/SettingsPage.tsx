import { useState, useEffect } from 'react';
import { Key, RefreshCcw, Shield, Trash2, Check, Cpu, AlertTriangle, Loader, LogOut, Bug, Clock, Zap, Activity, Share2, Link, UserX, Copy, Users, StopCircle } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { storeApiKey, hasStoredApiKey, revokeApiKey, retrieveApiKey } from '../utils/encryption';
import {
    loginWithAntigravity,
    getStoredAntigravityAccount,
    clearAntigravityAccount,
    ANTIGRAVITY_MODELS,
    type AntigravityAccount,
    getDebugLogs,
    clearDebugLogs,
    getTokenDebugInfo,
    type DebugLogEntry,
} from '../utils/antigravity';
import toast from 'react-hot-toast';

interface GeminiModel {
    id: string;
    displayName: string;
    description: string;
}

interface SessionGuest {
    guestEntryId: string;
    userId: string;
    username: string;
    displayName: string;
    joinedAt: string;
}

export default function SettingsPage() {
    const { user, refreshUser, logout } = useAuth();
    const [hasKey, setHasKey] = useState(false);
    const [showKeySetup, setShowKeySetup] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [savingKey, setSavingKey] = useState(false);

    const [clearConfirm, setClearConfirm] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    const [models, setModels] = useState<GeminiModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [proModel, setProModel] = useState(user?.settings?.proModel || 'gemini-3-flash-preview');
    const [flashModel, setFlashModel] = useState(user?.settings?.flashModel || 'gemini-3-flash-preview');
    const [savingSettings, setSavingSettings] = useState(false);
    const [deletingList, setDeletingList] = useState(false);
    const [deletingAccount, setDeletingAccount] = useState(false);

    // Antigravity auth state
    const [antigravityAccount, setAntigravityAccount] = useState<AntigravityAccount | null>(null);
    const [antigravityLoading, setAntigravityLoading] = useState(false);

    // Session sharing state
    const [sessionInfo, setSessionInfo] = useState<{
        hasSession: boolean;
        inviteToken?: string;
        inviteUrl?: string;
        guests: SessionGuest[];
    } | null>(null);
    const [sharingLoading, setSharingLoading] = useState(false);
    const [showDashboard, setShowDashboard] = useState(false);

    // Debug panel state
    const [showDebug, setShowDebug] = useState(false);
    const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
    const [tokenInfo, setTokenInfo] = useState(getTokenDebugInfo());

    useEffect(() => {
        const hasKey = hasStoredApiKey();
        setHasKey(hasKey);
        
        const account = getStoredAntigravityAccount();
        setAntigravityAccount(account);

        // Load session sharing info
        api.getSessionInfo().then(info => {
            setSessionInfo(info);
            if (info.hasSession) setShowDashboard(true);
        }).catch(() => { });

        // Dynamically load models on mount if Antigravity is active
        if (account) {
            api.listModels(undefined, account.accessToken)
                .then(res => setModels(res.models))
                .catch(() => {
                    setModels(ANTIGRAVITY_MODELS);
                });
        }
    }, []);

    // Poll session info every 10s when admin has active session
    useEffect(() => {
        if (!sessionInfo?.hasSession) return;
        const interval = setInterval(() => {
            api.getSessionInfo().then(info => {
                setSessionInfo(info);
            }).catch(() => { });
        }, 10000);
        return () => clearInterval(interval);
    }, [sessionInfo?.hasSession]);

    // Refresh debug info periodically when panel is open
    useEffect(() => {
        if (!showDebug) return;
        setDebugLogs(getDebugLogs());
        setTokenInfo(getTokenDebugInfo());
        const interval = setInterval(() => {
            setDebugLogs(getDebugLogs());
            setTokenInfo(getTokenDebugInfo());
        }, 3000);
        return () => clearInterval(interval);
    }, [showDebug]);

    const loadModels = async (force = false) => {
        const account = getStoredAntigravityAccount();
        if (account) {
            setLoadingModels(true);
            try {
                const { models: modelList } = await api.listModels(undefined, account.accessToken, force);
                setModels(modelList);
                toast.success(`Loaded ${modelList.length} Antigravity models`);
            } catch (err: any) {
                setModels(ANTIGRAVITY_MODELS);
                toast.error(err.message || 'Failed to load live models, using offline defaults');
            } finally {
                setLoadingModels(false);
            }
            return;
        }

        if (!hasStoredApiKey()) {
            toast.error('Set up your API key or sign in with Google first');
            return;
        }

        setLoadingModels(true);
        try {
            const enteredPin = prompt('Enter your PIN to load models:');
            if (!enteredPin) return;

            const key = await retrieveApiKey(enteredPin);
            if (!key) {
                toast.error('Invalid PIN');
                return;
            }

            const { models: modelList } = await api.listModels(key, undefined, force);
            setModels(modelList);
            toast.success(`Loaded ${modelList.length} models`);
        } catch (err: any) {
            toast.error(err.message || 'Failed to load models');
        } finally {
            setLoadingModels(false);
        }
    };

    const handleSaveApiKey = async () => {
        if (!apiKey.trim()) {
            toast.error('Please enter your API key');
            return;
        }
        if (!pin || pin.length < 4) {
            toast.error('PIN must be at least 4 characters');
            return;
        }
        if (pin !== confirmPin) {
            toast.error('PINs do not match');
            return;
        }

        setSavingKey(true);
        try {
            // Verify the key works by listing models
            const { models: modelList } = await api.listModels(apiKey);
            setModels(modelList);

            // Store encrypted
            await storeApiKey(apiKey, pin);
            setHasKey(true);
            setShowKeySetup(false);
            setApiKey('');
            setPin('');
            setConfirmPin('');
            toast.success(`API key saved and encrypted! Found ${modelList.length} available models.`);
        } catch (err: any) {
            toast.error(err.message || 'Invalid API key');
        } finally {
            setSavingKey(false);
        }
    };

    const handleRevokeKey = () => {
        if (!confirm('Revoke your API key? This will delete the encrypted key from local storage.')) return;
        revokeApiKey();
        setHasKey(false);
        setModels([]);
        toast.success('API key revoked');
    };

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await api.updateSettings({ proModel, flashModel });
            await refreshUser();
            toast.success('Settings saved!');
        } catch (err: any) {
            toast.error(err.message || 'Failed to save settings');
        } finally {
            setSavingSettings(false);
        }
    };

    // Build model list: use fetched models if available, else construct from defaults + Antigravity
    const getModelList = (): GeminiModel[] => {
        let list: GeminiModel[] = [];
        if (models.length > 0) {
            list = [...models];
        } else {
            // Default models for standard API key users
            const defaults: GeminiModel[] = [
                { id: 'gemini-3.5-pro', displayName: 'Gemini 3.5 Pro', description: 'Advanced reasoning and coding' },
                { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', description: 'Fast, efficient, and cost-effective' },
                { id: 'gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash Lite', description: 'Lightweight' },
                { id: 'gemini-3.1-pro-high', displayName: 'Gemini 3.1 Pro (High)', description: 'Latest & most capable, high compute' },
                { id: 'gemini-3.1-pro-low', displayName: 'Gemini 3.1 Pro (Low)', description: 'Latest pro model, lower compute' },
                { id: 'gemini-2.5-pro-preview-05-06', displayName: 'Gemini 2.5 Pro', description: 'Advanced reasoning' },
                { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', description: 'Fast and cost-effective' },
                { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', description: 'Fast and cost-effective' },
            ];

            if (antigravityAccount) {
                const antigravityIds = new Set(ANTIGRAVITY_MODELS.map(m => m.id));
                const extraDefaults = defaults.filter(d => !antigravityIds.has(d.id));
                list = [...ANTIGRAVITY_MODELS, ...extraDefaults];
            } else {
                list = defaults;
            }
        }

        // Add saved proModel if missing to preserve the user's setting visually
        const savedPro = user?.settings?.proModel;
        if (savedPro && savedPro !== '__custom') {
            if (!list.some(m => m.id === savedPro)) {
                list.push({
                    id: savedPro,
                    displayName: `⚠ ${savedPro} (Saved, but currently unavailable)`,
                    description: 'Saved configuration model is not active on your Google account'
                });
            }
        }

        // Add saved flashModel if missing to preserve the user's setting visually
        const savedFlash = user?.settings?.flashModel;
        if (savedFlash && savedFlash !== '__custom') {
            if (!list.some(m => m.id === savedFlash)) {
                list.push({
                    id: savedFlash,
                    displayName: `⚠ ${savedFlash} (Saved, but currently unavailable)`,
                    description: 'Saved configuration model is not active on your Google account'
                });
            }
        }

        return list;
    };

    // Deduplicate by id
    const deduped = getModelList().filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);
    const proModels = deduped;
    const flashModels = deduped;

    return (
        <div className="page">
            <div className="page-header animate-slide-up">
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Configure your AI models and API key</p>
            </div>

            <div className="settings-grid animate-fade-in">
                {/* API Key Section */}
                <div className="card settings-section">
                    <div className="card-body">
                        <div className="settings-section-header">
                            <div className="flex items-center gap-3">
                                <div className="settings-icon">
                                    <Key size={20} />
                                </div>
                                <div>
                                    <h3>Gemini API Key</h3>
                                    <p className="settings-desc">
                                        Your API key is stored locally encrypted and never sent to our servers
                                    </p>
                                </div>
                            </div>
                        </div>

                        {hasKey ? (
                            <div className="key-status">
                                <div className="key-status-badge success">
                                    <Shield size={16} /> API Key configured & encrypted
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <button className="btn btn-secondary btn-sm" onClick={() => setShowKeySetup(true)}>
                                        Update Key
                                    </button>
                                    <button className="btn btn-danger btn-sm" onClick={handleRevokeKey}>
                                        <Trash2 size={14} /> Revoke
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="key-status">
                                <div className="key-status-badge warning">
                                    <Key size={16} /> No API key configured
                                </div>
                                <button
                                    className="btn btn-gradient btn-sm mt-2"
                                    onClick={() => setShowKeySetup(true)}
                                >
                                    Set Up API Key
                                </button>
                            </div>
                        )}

                        {showKeySetup && (
                            <div className="key-setup mt-4">
                                <div className="card" style={{ background: 'var(--bg-primary)', padding: 20 }}>
                                    <h4 style={{ marginBottom: 16, fontFamily: 'var(--font-display)' }}>
                                        🔐 Set Up Gemini API Key
                                    </h4>
                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                                        Get your key from{' '}
                                        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                                            Google AI Studio
                                        </a>
                                        . We encrypt it with your PIN using AES-256-GCM.
                                    </p>

                                    <div className="flex flex-col gap-3">
                                        <div className="input-group">
                                            <label>Gemini API Key</label>
                                            <input
                                                className="input"
                                                type="password"
                                                placeholder="AIza..."
                                                value={apiKey}
                                                onChange={e => setApiKey(e.target.value)}
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label>Create PIN (min 4 chars)</label>
                                            <input
                                                className="input"
                                                type="password"
                                                placeholder="Enter a PIN to encrypt your key"
                                                value={pin}
                                                onChange={e => setPin(e.target.value)}
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label>Confirm PIN</label>
                                            <input
                                                className="input"
                                                type="password"
                                                placeholder="Confirm your PIN"
                                                value={confirmPin}
                                                onChange={e => setConfirmPin(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button className="btn btn-primary" onClick={handleSaveApiKey} disabled={savingKey}>
                                                {savingKey ? 'Verifying & Saving...' : 'Save & Encrypt'}
                                            </button>
                                            <button className="btn btn-ghost" onClick={() => setShowKeySetup(false)}>
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Antigravity OAuth Section */}
                <div className="card settings-section">
                    <div className="card-body">
                        <div className="settings-section-header">
                            <div className="flex items-center gap-3">
                                <div className="settings-icon" style={{ background: 'rgba(66, 133, 244, 0.15)' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                </div>
                                <div>
                                    <h3>Google Antigravity Auth</h3>
                                    <p className="settings-desc">
                                        Sign in with Google to use Gemini AI without an API key
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Warning Banner */}
                        <div style={{
                            marginTop: 16,
                            padding: '12px 16px',
                            background: 'rgba(245, 158, 11, 0.08)',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.78rem',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.5,
                        }}>
                            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                                <AlertTriangle size={14} color="var(--warning)" />
                                <strong style={{ color: 'var(--warning)', fontSize: '0.82rem' }}>⚠️ Use with Caution</strong>
                            </div>
                            This uses an internal Google Cloud Code API. Accounts — particularly new ones — may face restrictions.
                            <strong> We strongly recommend using a secondary Google account</strong>, not your primary one.
                        </div>

                        {antigravityAccount ? (
                            <div className="key-status" style={{ marginTop: 16 }}>
                                <div className="key-status-badge success">
                                    <Shield size={16} /> Connected as {antigravityAccount.email || 'Google Account'}
                                </div>
                                {antigravityAccount.projectId && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 6, paddingLeft: 2 }}>
                                        Project: <code style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4 }}>{antigravityAccount.projectId}</code>
                                    </div>
                                )}
                                <div className="flex gap-2 mt-2">
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            setShowDebug(!showDebug);
                                        }}
                                    >
                                        <Bug size={14} /> {showDebug ? 'Hide' : 'Show'} Debug
                                    </button>
                                    <button
                                        className="btn btn-danger btn-sm"
                                        onClick={() => {
                                            if (!confirm('Sign out of Antigravity Auth? You can sign in again later.')) return;
                                            clearAntigravityAccount();
                                            setAntigravityAccount(null);
                                            toast.success('Signed out of Antigravity Auth');
                                        }}
                                    >
                                        <LogOut size={14} /> Sign Out
                                    </button>
                                </div>

                                {/* ── Share Session / Admin Dashboard ── */}
                                {antigravityAccount && (
                                    <div style={{
                                        marginTop: 16,
                                        padding: '14px 16px',
                                        borderRadius: 12,
                                        background: sessionInfo?.hasSession ? 'rgba(52, 211, 153, 0.08)' : 'rgba(124, 92, 252, 0.06)',
                                        border: `1px solid ${sessionInfo?.hasSession ? 'rgba(52, 211, 153, 0.2)' : 'rgba(124, 92, 252, 0.15)'}`,
                                    }}>
                                        {!sessionInfo?.hasSession ? (
                                            /* ── Not sharing yet → Show "Share Session" button ── */
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                                    <Share2 size={16} style={{ color: 'var(--accent-primary)' }} />
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Share AI Session</div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                            Generate an invite link so friends can use AI features with your auth
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    className="btn btn-sm"
                                                    disabled={sharingLoading}
                                                    style={{
                                                        background: 'linear-gradient(135deg, #7c5cfc 0%, #34d399 100%)',
                                                        color: '#fff', border: 'none', fontWeight: 600,
                                                        padding: '8px 20px', borderRadius: 8,
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                    }}
                                                    onClick={async () => {
                                                        setSharingLoading(true);
                                                        try {
                                                            const result = await api.shareSession({
                                                                accessToken: antigravityAccount.accessToken,
                                                                refreshToken: antigravityAccount.refreshToken,
                                                                projectId: antigravityAccount.projectId,
                                                                email: antigravityAccount.email,
                                                                tokenExpiry: antigravityAccount.tokenExpiry,
                                                            });
                                                            const info = await api.getSessionInfo();
                                                            setSessionInfo(info);
                                                            setShowDashboard(true);

                                                            // Copy invite URL to clipboard
                                                            const fullUrl = `${window.location.origin}${result.inviteUrl}`;
                                                            await navigator.clipboard.writeText(fullUrl);
                                                            toast.success('🔗 Invite link copied to clipboard! Share it with friends.');
                                                        } catch (err: any) {
                                                            toast.error(err.message || 'Failed to create shared session');
                                                        } finally {
                                                            setSharingLoading(false);
                                                        }
                                                    }}
                                                >
                                                    {sharingLoading ? <Loader size={14} className="spinning" /> : <Link size={14} />}
                                                    {sharingLoading ? 'Generating...' : 'Generate Invite Link'}
                                                </button>
                                            </div>
                                        ) : (
                                            /* ── Active session → Admin Dashboard ── */
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <Users size={16} style={{ color: '#34d399' }} />
                                                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Session Active</div>
                                                    </div>
                                                    <button
                                                        className="btn btn-sm"
                                                        onClick={() => setShowDashboard(!showDashboard)}
                                                        style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                                                    >
                                                        {showDashboard ? 'Hide' : 'Show'} Dashboard
                                                    </button>
                                                </div>

                                                {showDashboard && (
                                                    <div>
                                                        {/* Invite Link Display */}
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                                                            background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 12,
                                                        }}>
                                                            <code style={{ flex: 1, fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                                                {window.location.origin}{sessionInfo.inviteUrl}
                                                            </code>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                onClick={async () => {
                                                                    await navigator.clipboard.writeText(`${window.location.origin}${sessionInfo.inviteUrl}`);
                                                                    toast.success('📋 Invite link copied!');
                                                                }}
                                                                style={{ padding: '4px 8px' }}
                                                            >
                                                                <Copy size={14} />
                                                            </button>
                                                        </div>

                                                        {/* Guest List */}
                                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                                                            Connected Guests ({sessionInfo.guests.length})
                                                        </div>
                                                        {sessionInfo.guests.length === 0 ? (
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '8px 0' }}>
                                                                No one has joined yet. Share the invite link!
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                {sessionInfo.guests.map(guest => (
                                                                    <div key={guest.userId} style={{
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                        padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8,
                                                                    }}>
                                                                        <div>
                                                                            <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{guest.displayName}</div>
                                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>@{guest.username} • joined {new Date(guest.joinedAt).toLocaleDateString()}</div>
                                                                        </div>
                                                                        <button
                                                                            className="btn btn-danger btn-sm"
                                                                            style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                                                                            onClick={async () => {
                                                                                try {
                                                                                    await api.revokeGuest(guest.userId);
                                                                                    // Refresh session info
                                                                                    const info = await api.getSessionInfo();
                                                                                    setSessionInfo(info);
                                                                                    toast.success(`Revoked access for ${guest.displayName}`);
                                                                                } catch (err: any) {
                                                                                    toast.error(err.message || 'Failed to revoke');
                                                                                }
                                                                            }}
                                                                        >
                                                                            <UserX size={12} /> Revoke
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Stop Sharing Button */}
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{
                                                                marginTop: 12, fontSize: '0.75rem', padding: '6px 14px',
                                                                background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                                                                border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8,
                                                                display: 'flex', alignItems: 'center', gap: 6,
                                                            }}
                                                            onClick={async () => {
                                                                if (!confirm('Stop sharing? All guests will lose access immediately.')) return;
                                                                try {
                                                                    await api.stopSession();
                                                                    setSessionInfo({ hasSession: false, guests: [] });
                                                                    setShowDashboard(false);
                                                                    toast.success('🔒 Session sharing stopped.');
                                                                } catch (err: any) {
                                                                    toast.error(err.message || 'Failed to stop session');
                                                                }
                                                            }}
                                                        >
                                                            <StopCircle size={14} /> Stop Sharing
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Debug Panel */}
                                {showDebug && (
                                    <div className="debug-panel">
                                        <div className="debug-header">
                                            <h4><Bug size={16} /> API Debug Console</h4>
                                            <button className="btn btn-ghost btn-sm" onClick={() => { clearDebugLogs(); setDebugLogs([]); toast.success('Debug logs cleared'); }}>
                                                Clear Logs
                                            </button>
                                        </div>

                                        {/* Token Status */}
                                        <div className="debug-section">
                                            <h5><Zap size={14} /> Token Status</h5>
                                            <div className="debug-grid">
                                                <div className="debug-row">
                                                    <span className="debug-label">Status</span>
                                                    <span className={`debug-value ${tokenInfo.isExpired ? 'error' : 'success'}`}>
                                                        {tokenInfo.isExpired ? '🔴 Expired' : '🟢 Active'}
                                                    </span>
                                                </div>
                                                <div className="debug-row">
                                                    <span className="debug-label">Expires In</span>
                                                    <span className="debug-value">{tokenInfo.tokenExpiresIn}</span>
                                                </div>
                                                <div className="debug-row">
                                                    <span className="debug-label">Expiry Time</span>
                                                    <span className="debug-value">{tokenInfo.tokenExpiry}</span>
                                                </div>
                                                <div className="debug-row">
                                                    <span className="debug-label">Email</span>
                                                    <span className="debug-value">{tokenInfo.email}</span>
                                                </div>
                                                <div className="debug-row">
                                                    <span className="debug-label">Project ID</span>
                                                    <span className="debug-value mono">{tokenInfo.projectId}</span>
                                                </div>
                                                <div className="debug-row">
                                                    <span className="debug-label">Session Start</span>
                                                    <span className="debug-value">{tokenInfo.createdAt}</span>
                                                </div>
                                                <div className="debug-row">
                                                    <span className="debug-label">Last Refresh</span>
                                                    <span className="debug-value">{tokenInfo.lastRefreshed}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Request Stats */}
                                        <div className="debug-section">
                                            <h5><Activity size={14} /> Request Stats</h5>
                                            <div className="debug-grid">
                                                <div className="debug-row">
                                                    <span className="debug-label">Total Requests</span>
                                                    <span className="debug-value">{tokenInfo.totalRequests}</span>
                                                </div>
                                                <div className="debug-row">
                                                    <span className="debug-label">Errors (1h)</span>
                                                    <span className={`debug-value ${tokenInfo.recentErrors > 0 ? 'error' : ''}`}>
                                                        {tokenInfo.recentErrors}
                                                    </span>
                                                </div>
                                                <div className="debug-row">
                                                    <span className="debug-label">API Endpoint</span>
                                                    <span className="debug-value mono">cloudcode-pa.googleapis.com</span>
                                                </div>
                                                <div className="debug-row">
                                                    <span className="debug-label">API Version</span>
                                                    <span className="debug-value mono">v1internal</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Request Log */}
                                        <div className="debug-section">
                                            <h5><Clock size={14} /> Request Log ({debugLogs.length} entries)</h5>
                                            <div className="debug-log-list">
                                                {debugLogs.length === 0 ? (
                                                    <div className="debug-empty">No requests logged yet. Make an API call to see activity.</div>
                                                ) : (
                                                    debugLogs.slice(0, 30).map((log, i) => (
                                                        <div key={i} className={`debug-log-entry ${log.type}`}>
                                                            <div className="debug-log-header">
                                                                <span className={`debug-log-type ${log.type}`}>
                                                                    {log.type === 'request' ? '→' : log.type === 'response' ? '←' : log.type === 'error' ? '✗' : log.type === 'token' ? '🔑' : 'ℹ'}
                                                                    {' '}{log.type.toUpperCase()}
                                                                </span>
                                                                <span className="debug-log-time">
                                                                    {new Date(log.timestamp).toLocaleTimeString()}
                                                                </span>
                                                            </div>
                                                            <div className="debug-log-action">{log.action}</div>
                                                            <div className="debug-log-details">{log.details}</div>
                                                            {log.endpoint && <div className="debug-log-endpoint">📍 {log.endpoint}</div>}
                                                            {log.model && <div className="debug-log-model">🤖 Model: {log.model}</div>}
                                                            {log.status && <div className="debug-log-status">HTTP {log.status}</div>}
                                                            {log.duration != null && <div className="debug-log-duration">⏱️ {log.duration}ms</div>}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ marginTop: 16 }}>
                                <button
                                    className="btn btn-sm"
                                    disabled={antigravityLoading}
                                    style={{
                                        background: '#fff',
                                        color: '#3c4043',
                                        border: '1px solid #dadce0',
                                        fontWeight: 500,
                                        padding: '8px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        fontSize: '0.88rem',
                                        borderRadius: 8,
                                        transition: '0.2s',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                    }}
                                    onClick={async () => {
                                        setAntigravityLoading(true);
                                        try {
                                            const account = await loginWithAntigravity();
                                            setAntigravityAccount(account);
                                            toast.success(`Signed in as ${account.email || 'Google Account'}`);
                                        } catch (err: any) {
                                            toast.error(err.message || 'Failed to sign in');
                                        } finally {
                                            setAntigravityLoading(false);
                                        }
                                    }}
                                >
                                    {antigravityLoading ? (
                                        <><Loader size={16} className="spinning" /> Connecting...</>
                                    ) : (
                                        <>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                            </svg>
                                            Sign in with Google
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Model Selection */}
                <div className="card settings-section">
                    <div className="card-body">
                        <div className="settings-section-header">
                            <div className="flex items-center gap-3">
                                <div className="settings-icon">
                                    <Cpu size={20} />
                                </div>
                                <div>
                                    <h3>AI Model Selection</h3>
                                    <p className="settings-desc">
                                        Choose which Gemini models to use for different tasks
                                    </p>
                                </div>
                            </div>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => loadModels(true)}
                                disabled={loadingModels}
                            >
                                <RefreshCcw size={14} className={loadingModels ? 'spinning' : ''} />
                                {loadingModels ? 'Loading...' : 'Refresh Models'}
                            </button>
                        </div>

                        <div className="flex flex-col gap-4 mt-4">
                            <div className="input-group">
                                <label>
                                    <strong>Recommendation Model</strong> (Pro)
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: 8 }}>
                                        Used for generating personalized recommendations
                                    </span>
                                </label>
                                <select
                                    className="input"
                                    value={proModel}
                                    onChange={e => setProModel(e.target.value)}
                                >
                                    {proModels.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.displayName || m.id} — {m.description}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label>
                                    <strong>Tag/Profile Model</strong> (Flash)
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: 8 }}>
                                        Used for tag extraction and user.md generation
                                    </span>
                                </label>
                                <select
                                    className="input"
                                    value={flashModel}
                                    onChange={e => setFlashModel(e.target.value)}
                                >
                                    {flashModels.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.displayName || m.id} — {m.description}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                className="btn btn-primary"
                                onClick={handleSaveSettings}
                                disabled={savingSettings}
                            >
                                <Check size={16} />
                                {savingSettings ? 'Saving...' : 'Save Model Settings'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Account Section */}
                <div className="card settings-section">
                    <div className="card-body">
                        <div className="settings-section-header">
                            <div className="flex items-center gap-3">
                                <div className="settings-icon" style={{ background: 'rgba(255, 107, 157, 0.15)' }}>
                                    <Shield size={20} style={{ color: 'var(--accent-secondary)' }} />
                                </div>
                                <div>
                                    <h3>Account</h3>
                                    <p className="settings-desc">Manage your account</p>
                                </div>
                            </div>
                        </div>

                        <div className="account-info mt-4">
                            <div className="account-row">
                                <span className="account-label">Email</span>
                                <span>{user?.email}</span>
                            </div>
                            <div className="account-row">
                                <span className="account-label">Username</span>
                                <span>@{user?.username}</span>
                            </div>
                            <div className="account-row">
                                <span className="account-label">Display Name</span>
                                <span>{user?.displayName}</span>
                            </div>
                        </div>

                        <div className="danger-zone mt-4">
                            <h4 style={{ color: 'var(--error)', fontSize: '0.9rem', marginBottom: 12, fontWeight: 700 }}>
                                <AlertTriangle size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Danger Zone
                            </h4>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 'var(--radius-md)' }}>
                                    <div>
                                        <strong style={{ fontSize: '0.88rem' }}>Clear Anime List</strong>
                                        <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>Remove all anime from your list. Your account stays.</p>
                                    </div>
                                    <button
                                        className="btn btn-sm"
                                        disabled={deletingList}
                                        style={{ background: clearConfirm ? 'var(--error)' : 'rgba(239,68,68,0.15)', color: clearConfirm ? '#fff' : 'var(--error)', border: '1px solid rgba(239,68,68,0.3)', minWidth: 120, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', transition: '0.2s' }}
                                        onClick={async () => {
                                            if (!clearConfirm) {
                                                setClearConfirm(true);
                                                setTimeout(() => setClearConfirm(false), 3000);
                                                return;
                                            }
                                            setDeletingList(true);
                                            try {
                                                await api.deleteList();
                                                toast.success(`Cleared anime from your list!`);
                                            } catch (err: any) {
                                                console.error('Delete list error:', err);
                                                toast.error(err.message || 'Failed to clear list');
                                            } finally {
                                                setDeletingList(false);
                                                setClearConfirm(false);
                                            }
                                        }}>
                                        {deletingList ? <><Loader size={14} className="spinning" /> Clearing...</> : clearConfirm ? 'Click to confirm' : <><Trash2 size={14} /> Clear List</>}
                                    </button>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 'var(--radius-md)' }}>
                                    <div>
                                        <strong style={{ fontSize: '0.88rem' }}>Delete Account</strong>
                                        <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>Permanently delete your account and all data.</p>
                                    </div>
                                    <button
                                        className="btn btn-sm"
                                        disabled={deletingAccount}
                                        style={{ background: deleteConfirm ? 'var(--error)' : 'rgba(239,68,68,0.3)', color: '#fff', border: '1px solid rgba(239,68,68,0.5)', minWidth: 140, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', transition: '0.2s' }}
                                        onClick={async () => {
                                            if (!deleteConfirm) {
                                                setDeleteConfirm(true);
                                                setTimeout(() => setDeleteConfirm(false), 3000);
                                                return;
                                            }
                                            setDeletingAccount(true);
                                            try {
                                                await api.deleteAccount();
                                                toast.success('Account deleted. Goodbye!');
                                                setTimeout(() => logout(), 1000);
                                            } catch (err: any) {
                                                console.error('Delete account error:', err);
                                                toast.error(err.message || 'Failed to delete account');
                                                setDeletingAccount(false);
                                                setDeleteConfirm(false);
                                            }
                                        }}>
                                        {deletingAccount ? <><Loader size={14} className="spinning" /> Deleting...</> : deleteConfirm ? 'Click to confirm' : <><Trash2 size={14} /> Delete Account</>}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button className="btn btn-danger mt-4" onClick={logout}>
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
        .settings-grid {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 800px;
        }
        .settings-section-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }
        .settings-section h3 {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 700;
        }
        .settings-desc {
          font-size: 0.82rem;
          color: var(--text-secondary);
          margin-top: 2px;
        }
        .settings-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          background: rgba(124, 92, 252, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-primary);
          flex-shrink: 0;
        }
        .key-status {
          margin-top: 16px;
        }
        .key-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          font-weight: 600;
        }
        .key-status-badge.success {
          background: rgba(34, 197, 94, 0.1);
          color: var(--success);
          border: 1px solid rgba(34, 197, 94, 0.2);
        }
        .key-status-badge.warning {
          background: rgba(245, 158, 11, 0.1);
          color: var(--warning);
          border: 1px solid rgba(245, 158, 11, 0.2);
        }
        .account-info {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .account-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid var(--border-color);
          font-size: 0.9rem;
        }
        .account-label {
          color: var(--text-secondary);
          font-weight: 500;
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Debug Panel Styles */
        .debug-panel {
          margin-top: 16px;
          border: 1px solid rgba(124, 92, 252, 0.2);
          border-radius: var(--radius-md);
          background: rgba(10, 10, 26, 0.8);
          overflow: hidden;
        }
        .debug-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: rgba(124, 92, 252, 0.08);
          border-bottom: 1px solid rgba(124, 92, 252, 0.15);
        }
        .debug-header h4 {
          font-size: 0.88rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--accent-primary);
          font-family: 'Fira Code', monospace;
        }
        .debug-section {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(124, 92, 252, 0.08);
        }
        .debug-section:last-child {
          border-bottom: none;
        }
        .debug-section h5 {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .debug-grid {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .debug-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          font-size: 0.78rem;
        }
        .debug-label {
          color: var(--text-tertiary);
          font-weight: 500;
        }
        .debug-value {
          color: var(--text-primary);
          font-weight: 600;
        }
        .debug-value.mono {
          font-family: 'Fira Code', monospace;
          font-size: 0.72rem;
        }
        .debug-value.success { color: var(--success); }
        .debug-value.error { color: var(--error); }

        .debug-log-list {
          max-height: 300px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .debug-empty {
          text-align: center;
          padding: 20px;
          color: var(--text-tertiary);
          font-size: 0.78rem;
          font-style: italic;
        }
        .debug-log-entry {
          padding: 8px 10px;
          border-radius: 6px;
          font-size: 0.72rem;
          font-family: 'Fira Code', monospace;
          background: rgba(255,255,255,0.02);
          border-left: 3px solid rgba(124, 92, 252, 0.3);
        }
        .debug-log-entry.error {
          border-left-color: var(--error);
          background: rgba(239, 68, 68, 0.05);
        }
        .debug-log-entry.token {
          border-left-color: var(--warning);
        }
        .debug-log-entry.info {
          border-left-color: var(--success);
        }
        .debug-log-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        .debug-log-type {
          font-weight: 700;
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .debug-log-type.request { color: #60a5fa; }
        .debug-log-type.response { color: #34d399; }
        .debug-log-type.error { color: #f87171; }
        .debug-log-type.token { color: #fbbf24; }
        .debug-log-type.info { color: #a78bfa; }
        .debug-log-time {
          color: var(--text-tertiary);
          font-size: 0.68rem;
        }
        .debug-log-action {
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 2px;
        }
        .debug-log-details {
          color: var(--text-secondary);
          word-break: break-all;
        }
        .debug-log-endpoint, .debug-log-model, .debug-log-status, .debug-log-duration {
          color: var(--text-tertiary);
          font-size: 0.68rem;
          margin-top: 2px;
        }

        @media (max-width: 768px) {
          .settings-grid { gap: 12px; }
          .settings-section h3 { font-size: 0.95rem; }
          .settings-desc { font-size: 0.75rem; }
          .settings-icon { width: 34px; height: 34px; }
          .settings-section-header { gap: 10px; }
          .key-status-badge { font-size: 0.78rem; padding: 6px 10px; }
          .account-row { font-size: 0.82rem; flex-wrap: wrap; gap: 4px; }
          .debug-panel { font-size: 0.72rem; }
          .debug-header { padding: 10px 12px; }
          .debug-section { padding: 10px 12px; }
          .debug-row { flex-direction: column; align-items: flex-start; gap: 2px; }
          .debug-log-list { max-height: 200px; }
        }
        @media (max-width: 480px) {
          .settings-icon { width: 28px; height: 28px; }
          .settings-section h3 { font-size: 0.88rem; }
        }
      `}</style>
        </div>
    );
}
