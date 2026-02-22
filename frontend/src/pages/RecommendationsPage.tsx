import { useState, useEffect, useRef } from 'react';
import { Sparkles, Star, Plus, AlertTriangle, ChevronRight, Download, Clock, Zap, RefreshCcw, History, Check, Info, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import api from '../utils/api';
import { hasStoredApiKey, retrieveApiKey } from '../utils/encryption';
import { hasAntigravityAuth, getValidAntigravityToken } from '../utils/antigravity';
import toast from 'react-hot-toast';

interface Recommendation {
    animeId: number;
    score: number;
    explanation: string;
    anime: {
        id: number;
        anilistId?: number;
        title: string;
        coverImage: string;
        genres: string[];
        tags: string[];
        aiTags: string[];
        averageScore: number;
        episodes: number;
        format: string;
        synopsis: string;
    };
}

interface PastRecommendation {
    id: string;
    date: string;
    recommendations: Recommendation[];
}

type ProgressStep = 'idle' | 'auth' | 'profile' | 'recommend' | 'done' | 'error';

const STEP_LABELS: Record<ProgressStep, string> = {
    idle: '',
    auth: 'Authenticating...',
    profile: 'Updating your profile...',
    recommend: 'Generating AI recommendations...',
    done: 'Complete!',
    error: 'Error occurred',
};

const PAST_RECS_KEY = 'anirec_past_recommendations';

export default function RecommendationsPage() {
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasKey, setHasKey] = useState(false);
    const [pinPrompt, setPinPrompt] = useState(false);
    const [pin, setPin] = useState('');
    const [userMd, setUserMd] = useState('');
    const [showUserMd, setShowUserMd] = useState(false);
    const [listSize, setListSize] = useState(0);
    const [needsProfileUpdate, setNeedsProfileUpdate] = useState(false);

    // Progress tracking
    const [progressStep, setProgressStep] = useState<ProgressStep>('idle');
    const [elapsedTime, setElapsedTime] = useState(0);
    const [profileCached, setProfileCached] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Past recommendations
    const [pastRecs, setPastRecs] = useState<PastRecommendation[]>([]);
    const [expandedPast, setExpandedPast] = useState<string | null>(null);
    const [showPastRecs, setShowPastRecs] = useState(false);
    const [addedAnimeIds, setAddedAnimeIds] = useState<Set<number>>(new Set());

    // Confidence filter
    const [minConfidence, setMinConfidence] = useState(0);

    useEffect(() => {
        const checkAuth = async () => {
            let authAvailable = hasStoredApiKey() || hasAntigravityAuth();
            if (!authAvailable) {
                try {
                    const { isGuest } = await api.getGuestStatus();
                    authAvailable = isGuest;
                } catch { /* ignore */ }
            }
            setHasKey(authAvailable);
        };
        checkAuth();
        loadUserMd();
        loadPastRecommendations();
        loadUserList();
    }, []);

    // Elapsed time counter
    useEffect(() => {
        if (loading) {
            setElapsedTime(0);
            timerRef.current = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [loading]);

    const loadUserList = async () => {
        try {
            const { list } = await api.getMyList() as any;
            if (list) {
                setAddedAnimeIds(new Set(list.map((item: any) => item.animeId)));
            }
        } catch {
            // Silent fail
        }
    };

    const loadUserMd = async () => {
        try {
            const { userMd: md, listSize: ls, needsUpdate } = await api.getUserMd() as any;
            setUserMd(md);
            if (ls) setListSize(ls);
            if (needsUpdate) setNeedsProfileUpdate(true);
        } catch (err) {
            console.error('Failed to load user.md:', err);
        }
    };

    const loadPastRecommendations = () => {
        try {
            const stored = localStorage.getItem(PAST_RECS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as PastRecommendation[];
                setPastRecs(parsed);
            }
        } catch {
            // Silent fail
        }
    };

    const savePastRecommendation = (recs: Recommendation[]) => {
        const newEntry: PastRecommendation = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            recommendations: recs,
        };
        const updated = [newEntry, ...pastRecs].slice(0, 20); // Keep last 20 sessions
        setPastRecs(updated);
        localStorage.setItem(PAST_RECS_KEY, JSON.stringify(updated));
    };

    const deletePastRec = (id: string) => {
        const updated = pastRecs.filter(r => r.id !== id);
        setPastRecs(updated);
        localStorage.setItem(PAST_RECS_KEY, JSON.stringify(updated));
        toast.success('Recommendation session deleted');
    };

    const clearAllPastRecs = () => {
        if (!confirm('Clear all past recommendation history?')) return;
        setPastRecs([]);
        localStorage.removeItem(PAST_RECS_KEY);
        toast.success('History cleared');
    };

    const getAuthCredentials = async (): Promise<string | { accessToken: string; projectId: string } | null | undefined> => {
        if (hasAntigravityAuth()) {
            try {
                const { token, projectId } = await getValidAntigravityToken();
                return { accessToken: token, projectId };
            } catch (err: any) {
                toast.error(err.message || 'Antigravity auth expired. Please re-authenticate in Settings.');
                return undefined;
            }
        }

        if (hasStoredApiKey()) {
            return new Promise((resolve) => {
                setPinPrompt(true);
                const handlePin = async (enteredPin: string) => {
                    try {
                        const key = await retrieveApiKey(enteredPin);
                        setPinPrompt(false);
                        setPin('');
                        resolve(key);
                    } catch {
                        toast.error('Invalid PIN');
                        resolve(undefined);
                    }
                };
                (window as any).__pinHandler = handlePin;
            });
        }

        // Guest mode — check if user is on a shared session
        try {
            const { isGuest } = await api.getGuestStatus();
            if (isGuest) {
                return null; // null = backend injects admin's shared tokens
            }
        } catch { /* ignore */ }

        toast.error('Please set up your Gemini API key or sign in with Google in Settings');
        return undefined;
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    const generateRecommendations = async () => {
        setLoading(true);
        setProgressStep('auth');
        setProfileCached(false);

        try {
            const auth = await getAuthCredentials();
            if (auth === undefined) {
                setLoading(false);
                setProgressStep('idle');
                return;
            }

            setProgressStep('profile');
            try {
                const { userMd: newMd, cached } = await api.updateUserMd(auth);
                setUserMd(newMd);
                setProfileCached(!!cached);
                setNeedsProfileUpdate(false);
                if (cached) {
                    toast.success('Profile up to date (cached)', { id: 'rec-progress', duration: 2000 });
                }
            } catch (err: any) {
                if (!err.message?.includes('rate some anime')) {
                    console.warn('user.md update failed, continuing with existing:', err);
                } else {
                    toast.error('Please rate some anime first!', { id: 'rec-progress' });
                    setLoading(false);
                    setProgressStep('error');
                    return;
                }
            }

            setProgressStep('recommend');
            const { recommendations: recs } = await api.getRecommendations(auth);
            setRecommendations(recs);
            setProgressStep('done');
            toast.success(`Found ${recs.length} recommendations for you!`, { id: 'rec-progress' });

            // Save to past recommendations
            savePastRecommendation(recs);
        } catch (err: any) {
            setProgressStep('error');
            toast.error(err.message || 'Failed to generate recommendations', { id: 'rec-progress' });
        } finally {
            setLoading(false);
        }
    };

    const downloadUserMd = () => {
        if (!userMd) return;
        const blob = new Blob([userMd], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'user.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('user.md downloaded!');
    };

    const forceRegenerateProfile = async () => {
        const auth = await getAuthCredentials();
        if (!auth) return;
        setLoading(true);
        setProgressStep('profile');
        try {
            const { userMd: newMd } = await api.updateUserMd(auth, undefined, true);
            setUserMd(newMd);
            setNeedsProfileUpdate(false);
            toast.success('Profile regenerated!');
        } catch (err: any) {
            toast.error(err.message || 'Failed to regenerate profile');
        } finally {
            setLoading(false);
            setProgressStep('idle');
        }
    };

    const addToList = async (animeId: number) => {
        if (addedAnimeIds.has(animeId)) {
            toast('Already in your list!', { icon: 'ℹ️' });
            return;
        }
        try {
            await api.addToList(animeId);
            setAddedAnimeIds(prev => new Set([...prev, animeId]));
            toast.success('Added to your list!');
        } catch (err: any) {
            if (err.message?.includes('already')) {
                setAddedAnimeIds(prev => new Set([...prev, animeId]));
                toast('Already in your list', { icon: 'ℹ️' });
            } else {
                toast.error('Failed to add');
            }
        }
    };

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if ((window as any).__pinHandler) {
            (window as any).__pinHandler(pin);
        }
    };

    const getProgressPercent = () => {
        switch (progressStep) {
            case 'auth': return 15;
            case 'profile': return 40;
            case 'recommend': return 70;
            case 'done': return 100;
            default: return 0;
        }
    };

    const getConfidenceColor = (score: number) => {
        if (score >= 80) return 'var(--success)';
        if (score >= 60) return 'var(--warning)';
        return 'var(--error)';
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    // Filter recommendations by confidence
    const filteredRecs = recommendations.filter(r => r.score >= minConfidence);

    return (
        <div className="page">
            <div className="page-header animate-slide-up">
                <h1 className="page-title">
                    <Sparkles size={28} style={{ marginRight: 8 }} /> AI Recommendations
                </h1>
                <p className="page-subtitle">
                    Powered by your ratings, notes, and Gemini AI personalization
                    {listSize > 0 && <span className="list-badge">{listSize} anime in your list</span>}
                </p>
            </div>

            {/* Action buttons */}
            <div className="rec-actions animate-fade-in">
                <button
                    className="btn btn-gradient btn-lg"
                    onClick={generateRecommendations}
                    disabled={loading}
                >
                    {loading ? (
                        <>
                            <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                            Generating...
                        </>
                    ) : (
                        <>
                            <Sparkles size={18} />
                            Generate Recommendations
                        </>
                    )}
                </button>
                <button
                    className="btn btn-secondary"
                    onClick={() => setShowUserMd(!showUserMd)}
                >
                    {showUserMd ? 'Hide' : 'View'} Personalization Profile
                </button>
                {pastRecs.length > 0 && (
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowPastRecs(!showPastRecs)}
                    >
                        <History size={16} />
                        Past Recommendations ({pastRecs.length})
                    </button>
                )}
            </div>

            {/* Progress indicator */}
            {loading && (
                <div className="progress-panel animate-fade-in">
                    <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{ width: `${getProgressPercent()}%` }} />
                    </div>
                    <div className="progress-info">
                        <div className="progress-steps">
                            <div className={`progress-step ${progressStep === 'auth' ? 'active' : getProgressPercent() > 15 ? 'done' : ''}`}>
                                <Zap size={14} /> Auth
                            </div>
                            <div className={`progress-step ${progressStep === 'profile' ? 'active' : getProgressPercent() > 40 ? 'done' : ''}`}>
                                <RefreshCcw size={14} /> Profile
                            </div>
                            <div className={`progress-step ${progressStep === 'recommend' ? 'active' : getProgressPercent() > 70 ? 'done' : ''}`}>
                                <Sparkles size={14} /> AI Gen
                            </div>
                        </div>
                        <div className="progress-meta">
                            <span className="progress-label">{STEP_LABELS[progressStep]}</span>
                            <span className="progress-timer">
                                <Clock size={12} /> {formatTime(elapsedTime)}
                            </span>
                        </div>
                        {profileCached && progressStep !== 'profile' && (
                            <div className="progress-cached">⚡ Profile cached (no regeneration needed)</div>
                        )}
                    </div>
                </div>
            )}

            {!hasKey && (
                <div className="card card-body mt-4 animate-fade-in" style={{ borderColor: 'var(--warning)' }}>
                    <div className="flex items-center gap-3">
                        <AlertTriangle size={20} color="var(--warning)" />
                        <div>
                            <strong>AI Authentication Required</strong>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                Set up your Gemini API key or sign in with Google Antigravity Auth in Settings to enable AI recommendations.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* User.md viewer */}
            {showUserMd && (
                <div className="card mt-4 animate-fade-in">
                    <div className="card-body">
                        <div className="flex items-center" style={{ justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                            <h3 style={{ fontFamily: 'var(--font-display)' }}>📄 Your Personalization Profile (user.md)</h3>
                            <div className="flex gap-2">
                                {needsProfileUpdate && (
                                    <button className="btn btn-sm btn-secondary" onClick={forceRegenerateProfile} disabled={loading}>
                                        <RefreshCcw size={14} /> Regenerate
                                    </button>
                                )}
                                {userMd && (
                                    <button className="btn btn-sm btn-ghost" onClick={downloadUserMd}>
                                        <Download size={14} /> Download
                                    </button>
                                )}
                            </div>
                        </div>
                        {needsProfileUpdate && (
                            <div style={{
                                padding: '8px 12px',
                                background: 'rgba(245, 158, 11, 0.08)',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                borderRadius: 'var(--radius-md)',
                                fontSize: '0.78rem',
                                color: 'var(--warning)',
                                marginBottom: 12,
                            }}>
                                ⚠️ Your list has changed since last profile update. Click "Regenerate" or it will auto-update on next recommendation.
                            </div>
                        )}
                        <pre className="user-md-content">{userMd || 'No personalization data yet. Rate some anime to generate your profile!'}</pre>
                    </div>
                </div>
            )}

            {/* Past Recommendations Section - NEW FEATURE */}
            {showPastRecs && pastRecs.length > 0 && (
                <div className="past-recs-section mt-4 animate-fade-in">
                    <div className="past-recs-header">
                        <h2 className="past-recs-title">
                            <History size={20} /> Past Recommendations
                        </h2>
                        <button className="btn btn-ghost btn-sm" onClick={clearAllPastRecs}>
                            <Trash2 size={14} /> Clear All
                        </button>
                    </div>
                    <div className="past-recs-list">
                        {pastRecs.map(session => (
                            <div key={session.id} className="past-rec-session card">
                                <div
                                    className="past-rec-session-header"
                                    onClick={() => setExpandedPast(expandedPast === session.id ? null : session.id)}
                                >
                                    <div className="past-rec-session-info">
                                        <span className="past-rec-date">
                                            <Clock size={14} /> {formatDate(session.date)}
                                        </span>
                                        <span className="past-rec-count">
                                            {session.recommendations.length} recommendations
                                        </span>
                                    </div>
                                    <div className="past-rec-session-actions">
                                        <button className="btn btn-icon btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); deletePastRec(session.id); }}>
                                            <Trash2 size={14} />
                                        </button>
                                        {expandedPast === session.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </div>

                                {expandedPast === session.id && (
                                    <div className="past-rec-items animate-fade-in">
                                        {session.recommendations.map((rec) => {
                                            const isAdded = addedAnimeIds.has(rec.animeId);
                                            return (
                                                <div key={rec.animeId} className="past-rec-item">
                                                    <img
                                                        className="past-rec-img"
                                                        src={rec.anime?.coverImage || '/placeholder.jpg'}
                                                        alt={rec.anime?.title}
                                                    />
                                                    <div className="past-rec-info">
                                                        <span className="past-rec-name">{rec.anime?.title}</span>
                                                        <span className="past-rec-meta">
                                                            <Star size={11} fill="var(--warning)" color="var(--warning)" /> {rec.score}/100
                                                            {rec.anime?.format && <span className="tag tag-sm">{rec.anime.format}</span>}
                                                            {rec.anime?.episodes > 0 && <span>{rec.anime.episodes} ep</span>}
                                                        </span>
                                                    </div>
                                                    <div className="past-rec-actions">
                                                        {isAdded ? (
                                                            <span className="past-rec-added-badge">
                                                                <Check size={12} /> Added
                                                            </span>
                                                        ) : (
                                                            <button className="btn btn-primary btn-sm" onClick={() => addToList(rec.animeId)}>
                                                                <Plus size={14} /> Add
                                                            </button>
                                                        )}
                                                        {rec.anime?.anilistId && (
                                                            <a
                                                                href={`https://anilist.co/anime/${rec.anime.anilistId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="btn btn-ghost btn-sm"
                                                                title="View on AniList"
                                                            >
                                                                <Info size={14} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Confidence filter - NEW FEATURE */}
            {recommendations.length > 0 && (
                <div className="confidence-filter mt-4 animate-fade-in">
                    <label className="confidence-label">
                        Min confidence: <strong>{minConfidence}%</strong>
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="90"
                        step="10"
                        value={minConfidence}
                        onChange={e => setMinConfidence(Number(e.target.value))}
                        className="confidence-slider"
                    />
                    <span className="confidence-showing">
                        Showing {filteredRecs.length}/{recommendations.length}
                    </span>
                </div>
            )}

            {/* Recommendations grid */}
            {filteredRecs.length > 0 && (
                <div className="rec-results mt-4 animate-fade-in">
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', marginBottom: 16 }}>
                        🎯 Top Picks For You
                    </h2>
                    <div className="rec-list">
                        {filteredRecs.map((rec, index) => {
                            const isAdded = addedAnimeIds.has(rec.animeId);
                            return (
                                <div key={rec.animeId} className="rec-card card">
                                    <div className="rec-rank">#{index + 1}</div>
                                    <img
                                        className="rec-card-image"
                                        src={rec.anime?.coverImage || '/placeholder.jpg'}
                                        alt={rec.anime?.title}
                                    />
                                    <div className="rec-card-content">
                                        <div className="rec-card-header">
                                            <h3 className="rec-card-title">{rec.anime?.title}</h3>
                                            <div className="rec-score">
                                                <Star size={14} fill="var(--warning)" color="var(--warning)" />
                                                {rec.score}/100
                                            </div>
                                        </div>
                                        {/* Confidence badge - NEW */}
                                        <div className="rec-confidence-badge" style={{ color: getConfidenceColor(rec.score) }}>
                                            <div className="rec-confidence-dot" style={{ background: getConfidenceColor(rec.score) }} />
                                            {rec.score >= 80 ? 'High Match' : rec.score >= 60 ? 'Good Match' : 'Possible Match'}
                                        </div>
                                        <p className="rec-explanation">{rec.explanation}</p>
                                        <div className="rec-card-meta">
                                            {rec.anime?.genres?.slice(0, 4).map(g => (
                                                <span key={g} className="tag tag-sm">{g}</span>
                                            ))}
                                            {rec.anime?.format && <span className="tag tag-sm">{rec.anime.format}</span>}
                                            {rec.anime?.episodes && <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{rec.anime.episodes} ep</span>}
                                        </div>
                                        <div className="rec-card-actions">
                                            {isAdded ? (
                                                <span className="rec-added-badge">
                                                    <Check size={14} /> Already Added
                                                </span>
                                            ) : (
                                                <button className="btn btn-primary btn-sm" onClick={() => addToList(rec.animeId)}>
                                                    <Plus size={14} /> Add to List
                                                </button>
                                            )}
                                            {rec.anime?.anilistId && (
                                                <a
                                                    href={`https://anilist.co/anime/${rec.anime.anilistId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-ghost btn-sm"
                                                >
                                                    AniList <ChevronRight size={12} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {recommendations.length === 0 && !loading && (
                <div className="empty-state mt-6">
                    <div className="empty-state-icon">✨</div>
                    <div className="empty-state-title">Ready for Recommendations</div>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Rate some anime in your list, then click "Generate Recommendations" to get AI-powered picks!
                    </p>
                </div>
            )}

            {/* PIN prompt modal */}
            {pinPrompt && (
                <div className="modal-overlay" onClick={() => { setPinPrompt(false); setPin(''); }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">🔐 Enter PIN</h3>
                        </div>
                        <form onSubmit={handlePinSubmit}>
                            <div className="modal-body">
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16 }}>
                                    Enter your PIN to decrypt your Gemini API key
                                </p>
                                <input
                                    className="input"
                                    type="password"
                                    placeholder="Enter your PIN"
                                    value={pin}
                                    onChange={e => setPin(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => { setPinPrompt(false); setPin(''); }}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Unlock
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
        .rec-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .list-badge {
          display: inline-block;
          margin-left: 12px;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          background: rgba(124, 92, 252, 0.15);
          color: var(--accent-primary);
          vertical-align: middle;
        }

        /* Progress Panel */
        .progress-panel {
          margin-top: 20px;
          padding: 16px 20px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
        }
        .progress-bar-container {
          width: 100%;
          height: 6px;
          background: rgba(124, 92, 252, 0.1);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 12px;
        }
        .progress-bar-fill {
          height: 100%;
          background: var(--accent-gradient);
          border-radius: 3px;
          transition: width 0.5s ease;
        }
        .progress-info {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .progress-steps {
          display: flex;
          gap: 24px;
        }
        .progress-step {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-tertiary);
          opacity: 0.5;
          transition: all 0.3s;
        }
        .progress-step.active {
          color: var(--accent-primary);
          opacity: 1;
        }
        .progress-step.done {
          color: var(--success);
          opacity: 0.8;
        }
        .progress-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .progress-label {
          font-size: 0.82rem;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .progress-timer {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.78rem;
          color: var(--text-tertiary);
          font-family: 'Fira Code', monospace;
        }
        .progress-cached {
          font-size: 0.75rem;
          color: var(--success);
          font-weight: 500;
        }

        /* Confidence Filter */
        .confidence-filter {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          flex-wrap: wrap;
        }
        .confidence-label {
          font-size: 0.82rem;
          color: var(--text-secondary);
          white-space: nowrap;
        }
        .confidence-slider {
          flex: 1;
          min-width: 100px;
          accent-color: var(--accent-primary);
          height: 4px;
        }
        .confidence-showing {
          font-size: 0.75rem;
          color: var(--text-tertiary);
          white-space: nowrap;
        }

        /* Confidence Badge */
        .rec-confidence-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.72rem;
          font-weight: 700;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .rec-confidence-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        /* Already Added Badge */
        .rec-added-badge, .past-rec-added-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 12px;
          background: rgba(34, 197, 94, 0.12);
          color: var(--success);
          border-radius: 20px;
          font-size: 0.78rem;
          font-weight: 600;
        }

        .rec-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .rec-card {
          display: flex;
          gap: 16px;
          padding: 16px;
          position: relative;
          overflow: hidden;
        }
        .rec-rank {
          position: absolute;
          top: 0;
          left: 0;
          background: var(--accent-gradient);
          color: white;
          font-weight: 800;
          font-size: 0.75rem;
          padding: 4px 10px;
          border-radius: 0 0 var(--radius-md) 0;
        }
        .rec-card-image {
          width: 100px;
          height: 140px;
          object-fit: cover;
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }
        .rec-card-content {
          flex: 1;
          min-width: 0;
        }
        .rec-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 4px;
        }
        .rec-card-title {
          font-size: 1.05rem;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rec-score {
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 700;
          font-size: 0.9rem;
          color: var(--warning);
          white-space: nowrap;
        }
        .rec-explanation {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 10px;
          line-height: 1.5;
          font-style: italic;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .rec-card-meta {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          margin-bottom: 10px;
          overflow: hidden;
          max-height: 28px;
        }
        .rec-card-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .user-md-content {
          background: var(--bg-primary);
          padding: 16px;
          border-radius: var(--radius-md);
          font-size: 0.82rem;
          color: var(--text-secondary);
          white-space: pre-wrap;
          font-family: 'Fira Code', monospace;
          max-height: 400px;
          overflow-y: auto;
          border: 1px solid var(--border-color);
          word-break: break-word;
          overflow-wrap: break-word;
        }

        /* Past Recommendations */
        .past-recs-section {
          margin-bottom: 24px;
        }
        .past-recs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .past-recs-title {
          font-family: var(--font-display);
          font-size: 1.15rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .past-recs-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .past-rec-session {
          overflow: hidden;
        }
        .past-rec-session-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .past-rec-session-header:hover {
          background: var(--bg-glass);
        }
        .past-rec-session-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .past-rec-date {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .past-rec-count {
          font-size: 0.75rem;
          color: var(--text-tertiary);
        }
        .past-rec-session-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          color: var(--text-tertiary);
        }
        .past-rec-items {
          padding: 0 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .past-rec-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border-radius: var(--radius-md);
          transition: background 0.15s;
        }
        .past-rec-item:hover {
          background: var(--bg-glass);
        }
        .past-rec-img {
          width: 36px;
          height: 50px;
          object-fit: cover;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .past-rec-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .past-rec-name {
          font-size: 0.85rem;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .past-rec-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.72rem;
          color: var(--text-tertiary);
        }
        .past-rec-actions {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .rec-card {
            flex-direction: column;
          }
          .rec-card-image {
            width: 100%;
            height: 180px;
          }
          .rec-card-header {
            flex-direction: column;
          }
          .rec-card-title {
            font-size: 0.95rem;
          }
          .progress-steps {
            gap: 12px;
          }
          .rec-actions {
            flex-direction: column;
          }
          .rec-actions .btn {
            width: 100%;
            justify-content: center;
          }
          .past-rec-item {
            flex-wrap: wrap;
          }
          .past-rec-actions {
            width: 100%;
            margin-top: 6px;
          }
          .confidence-filter {
            flex-direction: column;
            align-items: stretch;
          }
        }

        @media (max-width: 480px) {
          .rec-card-image {
            height: 140px;
          }
          .rec-rank {
            font-size: 0.65rem;
            padding: 3px 8px;
          }
        }
      `}</style>
        </div>
    );
}
