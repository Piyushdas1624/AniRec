import { useState, useEffect, useRef } from 'react';
import { Radar, Share2, Flame, Target } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

// Define taste dimensions
const TASTE_DIMENSIONS = [
    { key: 'action', label: '⚔️ Action', genres: ['Action', 'Adventure', 'Martial Arts'] },
    { key: 'drama', label: '🎭 Drama', genres: ['Drama', 'Slice of Life', 'Music'] },
    { key: 'comedy', label: '😂 Comedy', genres: ['Comedy', 'Parody', 'Gag Humor'] },
    { key: 'romance', label: '💕 Romance', genres: ['Romance', 'Shoujo', 'Josei'] },
    { key: 'thriller', label: '🔪 Thriller', genres: ['Thriller', 'Horror', 'Mystery', 'Psychological'] },
    { key: 'fantasy', label: '🧙 Fantasy', genres: ['Fantasy', 'Supernatural', 'Magic'] },
    { key: 'scifi', label: '🚀 Sci-Fi', genres: ['Sci-Fi', 'Mecha', 'Space'] },
    { key: 'sports', label: '⚽ Sports', genres: ['Sports', 'Martial Arts', 'Cars'] },
];

// Otaku levels based on total anime watched + ratings
const OTAKU_LEVELS = [
    { min: 0, title: 'Newbie', emoji: '🌱', color: '#22c55e' },
    { min: 10, title: 'Casual', emoji: '📺', color: '#3b82f6' },
    { min: 30, title: 'Regular', emoji: '🎌', color: '#8b5cf6' },
    { min: 75, title: 'Enthusiast', emoji: '🔥', color: '#f59e0b' },
    { min: 150, title: 'Otaku', emoji: '⭐', color: '#ef4444' },
    { min: 300, title: 'Weeb Lord', emoji: '👑', color: '#f472b6' },
    { min: 500, title: 'Anime God', emoji: '🏆', color: '#ffd700' },
];

export default function TasteProfilePage() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [scores, setScores] = useState<Record<string, number>>({});
    const [animateBars, setAnimateBars] = useState(false);
    const [showShareCard, setShowShareCard] = useState(false);
    const [watchStreak, setWatchStreak] = useState(0);
    const barsRef = useRef<HTMLDivElement>(null);
    const shareCardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        api.getStats()
            .then(data => {
                setStats(data);
                calculateScores(data);
                loadWatchStreak();
            })
            .catch(() => toast.error('Failed to load profile data'))
            .finally(() => setLoading(false));
    }, []);

    // Trigger bar animation after render
    useEffect(() => {
        if (!loading && Object.keys(scores).length > 0) {
            const timer = setTimeout(() => setAnimateBars(true), 100);
            return () => clearTimeout(timer);
        }
    }, [loading, scores]);

    const loadWatchStreak = () => {
        const streakData = JSON.parse(localStorage.getItem('anirec_watch_streak') || '{"count":0,"lastDate":""}');
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (streakData.lastDate === today) {
            setWatchStreak(streakData.count);
        } else if (streakData.lastDate === yesterday) {
            setWatchStreak(streakData.count);
        } else {
            setWatchStreak(0);
        }
    };

    const calculateScores = (data: any) => {
        if (!data?.genreBreakdown) return;
        const genre = data.genreBreakdown as Record<string, number>;

        // FIX: Calculate dimension totals first, then normalize against the MAX dimension total
        // This prevents scores from exceeding 100%
        const dimensionTotals: Record<string, number> = {};
        for (const dim of TASTE_DIMENSIONS) {
            let total = 0;
            for (const g of dim.genres) {
                total += genre[g] || 0;
            }
            dimensionTotals[dim.key] = total;
        }

        const maxDimensionTotal = Math.max(...Object.values(dimensionTotals), 1);

        const result: Record<string, number> = {};
        for (const dim of TASTE_DIMENSIONS) {
            result[dim.key] = Math.round((dimensionTotals[dim.key] / maxDimensionTotal) * 100);
        }
        setScores(result);
    };

    // Get Otaku Level
    const getOtakuLevel = () => {
        const total = stats?.totalAnime || 0;
        let level = OTAKU_LEVELS[0];
        for (const l of OTAKU_LEVELS) {
            if (total >= l.min) level = l;
        }
        const nextLevel = OTAKU_LEVELS[OTAKU_LEVELS.indexOf(level) + 1];
        const progress = nextLevel
            ? Math.min(100, ((total - level.min) / (nextLevel.min - level.min)) * 100)
            : 100;
        return { ...level, progress, nextLevel, total };
    };

    // Genre diversity score (how evenly distributed genres are)
    const getGenreDiversity = () => {
        const vals = Object.values(scores);
        if (vals.length === 0) return 0;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / vals.length;
        // Low variance = high diversity
        return Math.max(0, Math.min(100, Math.round(100 - Math.sqrt(variance))));
    };

    // Share card as image (copies to clipboard)
    const handleShareProfile = async () => {
        setShowShareCard(true);
        toast.success('Share card shown! Take a screenshot or right-click to save.');
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner" />
                <span className="loading-text">Analyzing your taste...</span>
            </div>
        );
    }

    // Radar chart coordinates
    const cx = 200, cy = 200, r = 150;
    const dims = TASTE_DIMENSIONS;
    const n = dims.length;
    const radarPoints = dims.map((dim, i) => {
        const angle = (i * 360 / n - 90) * Math.PI / 180;
        const val = Math.min((scores[dim.key] || 0) / 100, 1); // Clamp to 1
        return {
            x: cx + r * val * Math.cos(angle),
            y: cy + r * val * Math.sin(angle),
            labelX: cx + (r + 28) * Math.cos(angle),
            labelY: cy + (r + 28) * Math.sin(angle),
            axisX: cx + r * Math.cos(angle),
            axisY: cy + r * Math.sin(angle),
        };
    });

    const polygonPoints = radarPoints.map(p => `${p.x},${p.y}`).join(' ');

    // Generate grid rings
    const rings = [0.25, 0.5, 0.75, 1];

    // Determine top 3 dimensions
    const ranked = [...TASTE_DIMENSIONS]
        .map(d => ({ ...d, score: scores[d.key] || 0 }))
        .sort((a, b) => b.score - a.score);

    const topDim = ranked[0];

    // Generate archetype
    const getArchetype = () => {
        if (!topDim || topDim.score === 0) return { name: 'Unknown Explorer', desc: 'Add more anime to discover your taste!', emoji: '🔍' };
        const archetypes: Record<string, { name: string; desc: string; emoji: string }> = {
            action: { name: 'Battle Enthusiast', desc: 'You live for the adrenaline rush of epic battles and heart-pounding action!', emoji: '⚔️' },
            drama: { name: 'Emotional Sage', desc: 'You appreciate stories that touch the heart and explore the human condition.', emoji: '🎭' },
            comedy: { name: 'Laughter Seeker', desc: 'You know that the best medicine is laughter, and anime delivers it in spades!', emoji: '😂' },
            romance: { name: 'Love Connoisseur', desc: 'Nothing warms your heart quite like a well-crafted love story.', emoji: '💕' },
            thriller: { name: 'Mind Game Master', desc: 'You thrive on suspense, twists, and psychological depth.', emoji: '🧠' },
            fantasy: { name: 'World Traveler', desc: 'You love exploring magical realms and supernatural adventures.', emoji: '🧙' },
            scifi: { name: 'Future Visionary', desc: 'You are drawn to technological marvels and cosmic adventures.', emoji: '🚀' },
            sports: { name: 'Spirit Champion', desc: 'You love the spirit of competition and the joy of athletic excellence!', emoji: '🏆' },
        };
        return archetypes[topDim.key] || { name: 'Versatile Otaku', desc: 'You have wide-ranging taste!', emoji: '🌟' };
    };

    const archetype = getArchetype();

    // Generate personalized tags based on user data
    const getTasteTags = () => {
        const tags: { label: string; color: string }[] = [];
        const totalAnime = stats?.totalAnime || 0;
        const avgRating = stats?.averageRating || 0;
        const favCount = stats?.favoritesCount || 0;
        const completed = stats?.statusCounts?.completed || 0;
        const genres = Object.keys(stats?.genreBreakdown || {}).length;

        if (totalAnime >= 200) tags.push({ label: '🏅 Veteran Weeb', color: '#f59e0b' });
        else if (totalAnime >= 100) tags.push({ label: '📺 Seasoned Viewer', color: '#3b82f6' });
        else if (totalAnime >= 50) tags.push({ label: '🌱 Growing Otaku', color: '#22c55e' });
        else tags.push({ label: '🔰 Fresh Start', color: '#14b8a6' });

        if (avgRating >= 8) tags.push({ label: '🌟 Generous Rater', color: '#f472b6' });
        else if (avgRating >= 6) tags.push({ label: '⚖️ Balanced Critic', color: '#3b82f6' });
        else if (avgRating > 0) tags.push({ label: '🧐 Tough Critic', color: '#ef4444' });

        if (favCount >= 20) tags.push({ label: '💕 Heart Collector', color: '#f472b6' });
        if (genres >= 15) tags.push({ label: '🌈 Genre Rainbow', color: '#a855f7' });
        if (completed >= 50) tags.push({ label: '✅ Finisher', color: '#22c55e' });

        // Based on top genres
        const top3 = ranked.slice(0, 3);
        if (top3[0]?.score > 70 && top3[1]?.score < 30) {
            tags.push({ label: '🎯 Specialist', color: '#ef4444' });
        } else if (top3[2]?.score > 40) {
            tags.push({ label: '🎨 Eclectic Taste', color: '#8b5cf6' });
        }

        // Diversity score tag
        const diversity = getGenreDiversity();
        if (diversity >= 70) tags.push({ label: '🌍 Well-Rounded', color: '#06b6d4' });

        return tags;
    };

    const tasteTags = getTasteTags();
    const otakuLevel = getOtakuLevel();
    const diversityScore = getGenreDiversity();

    // Compatibility scores (fun feature)
    const compatScores = [
        { name: 'Shonen Fan', score: Math.min(100, (scores.action || 0) * 0.7 + (scores.fantasy || 0) * 0.3) },
        { name: 'Film Buff', score: Math.min(100, (scores.drama || 0) * 0.5 + (scores.thriller || 0) * 0.3 + (scores.scifi || 0) * 0.2) },
        { name: 'Slice of Life Lover', score: Math.min(100, (scores.drama || 0) * 0.4 + (scores.comedy || 0) * 0.3 + (scores.romance || 0) * 0.3) },
        { name: 'Edgelord', score: Math.min(100, (scores.thriller || 0) * 0.5 + (scores.action || 0) * 0.3 + (scores.scifi || 0) * 0.2) },
    ];

    // Mood recommendations based on taste
    const getMoodRecommendation = () => {
        const hour = new Date().getHours();
        if (hour < 6) return { mood: '🌙 Late Night', suggestion: 'Perfect for a thriller or psychological anime', genre: 'thriller' };
        if (hour < 12) return { mood: '☀️ Morning', suggestion: 'Start the day with a feel-good comedy', genre: 'comedy' };
        if (hour < 17) return { mood: '🌤️ Afternoon', suggestion: 'Great time for an epic adventure', genre: 'action' };
        if (hour < 21) return { mood: '🌅 Evening', suggestion: 'Wind down with a touching drama or romance', genre: 'romance' };
        return { mood: '🌃 Night', suggestion: 'Perfect for sci-fi or fantasy escapism', genre: 'fantasy' };
    };

    const moodRec = getMoodRecommendation();

    return (
        <div className="page">
            <div className="page-header animate-slide-up">
                <h1 className="page-title"><Radar size={28} style={{ marginRight: 8 }} /> Your Anime Taste Profile</h1>
                <p className="page-subtitle">A visual breakdown of what makes your anime taste unique</p>
            </div>

            {/* Otaku Level Card - NEW FEATURE */}
            <div className="otaku-level-card card animate-fade-in">
                <div className="otaku-level-header">
                    <span className="otaku-level-emoji">{otakuLevel.emoji}</span>
                    <div className="otaku-level-info">
                        <span className="otaku-level-title" style={{ color: otakuLevel.color }}>{otakuLevel.title}</span>
                        <span className="otaku-level-count">{otakuLevel.total} anime tracked</span>
                    </div>
                    {watchStreak > 0 && (
                        <div className="watch-streak-badge">
                            <Flame size={14} /> {watchStreak} day streak
                        </div>
                    )}
                </div>
                <div className="otaku-level-bar">
                    <div className="otaku-level-fill" style={{
                        width: `${otakuLevel.progress}%`,
                        background: `linear-gradient(90deg, ${otakuLevel.color}, ${otakuLevel.color}88)`,
                    }} />
                </div>
                {otakuLevel.nextLevel && (
                    <span className="otaku-level-next">
                        {otakuLevel.nextLevel.min - otakuLevel.total} more to reach {otakuLevel.nextLevel.emoji} {otakuLevel.nextLevel.title}
                    </span>
                )}
            </div>

            {/* Archetype card */}
            <div className="archetype-card card animate-fade-in">
                <div className="archetype-emoji">{archetype.emoji}</div>
                <div className="archetype-info">
                    <span className="archetype-label">Your Archetype</span>
                    <h2 className="archetype-name">{archetype.name}</h2>
                    <p className="archetype-desc">{archetype.desc}</p>
                    {/* Taste tags */}
                    <div className="taste-tags">
                        {tasteTags.map((tag, i) => (
                            <span key={i} className="taste-tag" style={{ borderColor: tag.color, color: tag.color }}>
                                {tag.label}
                            </span>
                        ))}
                    </div>
                </div>
                <button className="btn btn-ghost btn-sm share-btn" onClick={handleShareProfile} title="Share profile">
                    <Share2 size={16} />
                </button>
            </div>

            {/* Mood-Based Suggestion - NEW FEATURE */}
            <div className="mood-card card animate-fade-in">
                <div className="mood-icon">{moodRec.mood}</div>
                <div className="mood-info">
                    <span className="mood-label">Based on the time of day</span>
                    <p className="mood-suggestion">{moodRec.suggestion}</p>
                    <span className="mood-score">Your {moodRec.genre} score: {scores[moodRec.genre] || 0}%</span>
                </div>
            </div>

            {/* Genre Diversity Score - NEW FEATURE */}
            <div className="diversity-section animate-fade-in">
                <div className="diversity-card card">
                    <Target size={18} />
                    <div className="diversity-info">
                        <span className="diversity-label">Genre Diversity</span>
                        <div className="diversity-bar">
                            <div className="diversity-fill" style={{
                                width: `${diversityScore}%`,
                                background: diversityScore >= 70 ? 'var(--success)' : diversityScore >= 40 ? 'var(--warning)' : 'var(--error)',
                            }} />
                        </div>
                        <span className="diversity-score">{diversityScore}%</span>
                    </div>
                    <span className="diversity-desc">
                        {diversityScore >= 70 ? 'Very diverse taste!' : diversityScore >= 40 ? 'Moderately diverse' : 'You have a focused taste'}
                    </span>
                </div>
            </div>

            {/* Radar chart + breakdown */}
            <div className="taste-layout animate-fade-in">
                <div className="radar-card card">
                    <h3 className="radar-title">Taste Radar</h3>
                    <div className="radar-container">
                        <svg viewBox="0 0 400 400" className="radar-svg">
                            {/* Grid rings */}
                            {rings.map(ring => (
                                <polygon
                                    key={ring}
                                    points={dims.map((_, i) => {
                                        const angle = (i * 360 / n - 90) * Math.PI / 180;
                                        return `${cx + r * ring * Math.cos(angle)},${cy + r * ring * Math.sin(angle)}`;
                                    }).join(' ')}
                                    fill="none"
                                    stroke="rgba(124,92,252,0.12)"
                                    strokeWidth="1"
                                />
                            ))}

                            {/* Axes */}
                            {radarPoints.map((p, i) => (
                                <line key={i} x1={cx} y1={cy} x2={p.axisX} y2={p.axisY}
                                    stroke="rgba(124,92,252,0.1)" strokeWidth="1" />
                            ))}

                            {/* Data polygon with glow */}
                            <polygon
                                points={polygonPoints}
                                fill="rgba(124,92,252,0.2)"
                                stroke="url(#radarGradient)"
                                strokeWidth="2.5"
                                style={{ filter: 'drop-shadow(0 0 6px rgba(124,92,252,0.4))' }}
                            />
                            <defs>
                                <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="var(--accent-primary)" />
                                    <stop offset="100%" stopColor="var(--accent-secondary)" />
                                </linearGradient>
                            </defs>

                            {/* Data points */}
                            {radarPoints.map((p, i) => (
                                <circle key={i} cx={p.x} cy={p.y} r="5"
                                    fill="var(--accent-primary)" stroke="white" strokeWidth="1.5" />
                            ))}

                            {/* Labels */}
                            {radarPoints.map((p, i) => (
                                <text key={i} x={p.labelX} y={p.labelY + 4}
                                    fill="var(--text-primary)" fontSize="11" fontWeight="600"
                                    textAnchor="middle" dominantBaseline="middle">
                                    {dims[i].label}
                                </text>
                            ))}
                        </svg>
                    </div>
                </div>

                {/* Breakdown bars */}
                <div className="breakdown-card card" ref={barsRef}>
                    <h3 className="radar-title">Dimension Breakdown</h3>
                    {ranked.map((dim, i) => (
                        <div key={dim.key} className="dim-row">
                            <div className="dim-header">
                                <span className="dim-label">{dim.label}</span>
                                <span className="dim-score">{dim.score}%</span>
                            </div>
                            <div className="dim-bar">
                                <div
                                    className="dim-bar-fill"
                                    style={{
                                        width: animateBars ? `${Math.min(dim.score, 100)}%` : '0%',
                                        transitionDelay: `${i * 0.1}s`,
                                        background: i === 0 ? 'var(--accent-gradient)' : `rgba(124,92,252,${0.7 - (i * 0.07)})`,
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Compatibility scores */}
            <div className="compatibility-section animate-fade-in">
                <h3 className="section-title">🤝 Compatibility Scores</h3>
                <div className="compat-grid">
                    {compatScores.map((cs, i) => (
                        <div key={i} className="compat-card card">
                            <div className="compat-ring">
                                <svg viewBox="0 0 80 80">
                                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(124,92,252,0.1)" strokeWidth="4" />
                                    <circle cx="40" cy="40" r="34" fill="none"
                                        stroke={cs.score >= 70 ? 'var(--success)' : cs.score >= 40 ? 'var(--warning)' : 'var(--text-tertiary)'}
                                        strokeWidth="4" strokeLinecap="round"
                                        strokeDasharray={`${2 * Math.PI * 34}`}
                                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - cs.score / 100)}`}
                                        transform="rotate(-90 40 40)"
                                        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                                    />
                                    <text x="40" y="40" textAnchor="middle" dominantBaseline="central"
                                        fill="var(--text-primary)" fontSize="14" fontWeight="800">
                                        {Math.round(cs.score)}%
                                    </text>
                                </svg>
                            </div>
                            <span className="compat-name">{cs.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Fun stats */}
            {stats && (
                <div className="fun-stats animate-fade-in">
                    <div className="fun-stat card">
                        <span className="fun-stat-value">{stats.totalAnime || 0}</span>
                        <span className="fun-stat-label">Anime Tracked</span>
                    </div>
                    <div className="fun-stat card">
                        <span className="fun-stat-value">{Object.keys(stats.genreBreakdown || {}).length}</span>
                        <span className="fun-stat-label">Genres Explored</span>
                    </div>
                    <div className="fun-stat card">
                        <span className="fun-stat-value">{stats.averageRating || '—'}</span>
                        <span className="fun-stat-label">Avg Rating</span>
                    </div>
                    <div className="fun-stat card">
                        <span className="fun-stat-value">{ranked[0]?.label?.split(' ')[0] || '—'}</span>
                        <span className="fun-stat-label">Top Genre</span>
                    </div>
                </div>
            )}

            {/* Share Card Modal - NEW FEATURE */}
            {showShareCard && (
                <div className="modal-overlay" onClick={() => setShowShareCard(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">📤 Share Your Taste Profile</h3>
                            <button className="btn btn-icon btn-ghost" onClick={() => setShowShareCard(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="share-card-preview" ref={shareCardRef}>
                                <div className="share-card-bg">
                                    <div className="share-card-header">
                                        <span className="share-card-logo">⚡ AniRec AI</span>
                                        <span className="share-card-title">My Anime Taste</span>
                                    </div>
                                    <div className="share-card-archetype">
                                        <span className="share-card-emoji">{archetype.emoji}</span>
                                        <span className="share-card-name">{archetype.name}</span>
                                    </div>
                                    <div className="share-card-stats">
                                        <div className="share-stat">
                                            <span className="share-stat-val">{stats?.totalAnime || 0}</span>
                                            <span className="share-stat-lbl">Anime</span>
                                        </div>
                                        <div className="share-stat">
                                            <span className="share-stat-val">{stats?.averageRating || '—'}</span>
                                            <span className="share-stat-lbl">Avg Rating</span>
                                        </div>
                                        <div className="share-stat">
                                            <span className="share-stat-val">{diversityScore}%</span>
                                            <span className="share-stat-lbl">Diversity</span>
                                        </div>
                                    </div>
                                    <div className="share-card-dims">
                                        {ranked.slice(0, 4).map(d => (
                                            <div key={d.key} className="share-dim">
                                                <span>{d.label}</span>
                                                <div className="share-dim-bar">
                                                    <div style={{ width: `${d.score}%`, background: 'var(--accent-gradient)', height: '100%', borderRadius: 3 }} />
                                                </div>
                                                <span>{d.score}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 12 }}>
                                Screenshot this card to share with friends!
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .otaku-level-card {
          padding: 16px 20px;
          margin-bottom: 16px;
          background: linear-gradient(135deg, rgba(124,92,252,0.08), rgba(255,107,157,0.05));
          border: 1px solid var(--border-color);
        }
        .otaku-level-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .otaku-level-emoji { font-size: 2rem; }
        .otaku-level-info { display: flex; flex-direction: column; flex: 1; }
        .otaku-level-title {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 800;
        }
        .otaku-level-count { font-size: 0.78rem; color: var(--text-tertiary); }
        .otaku-level-bar {
          height: 6px;
          background: var(--bg-secondary);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 6px;
        }
        .otaku-level-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.8s ease;
        }
        .otaku-level-next {
          font-size: 0.72rem;
          color: var(--text-tertiary);
        }
        .watch-streak-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          background: rgba(245,158,11,0.15);
          border: 1px solid rgba(245,158,11,0.3);
          border-radius: 20px;
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--warning);
          white-space: nowrap;
        }
        .archetype-card {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 24px;
          margin-bottom: 16px;
          border: 1px solid var(--accent-primary);
          background: linear-gradient(135deg, rgba(124,92,252,0.1), rgba(255,107,157,0.05));
          position: relative;
        }
        .share-btn {
          position: absolute;
          top: 12px;
          right: 12px;
        }
        .archetype-emoji { font-size: 3rem; flex-shrink: 0; }
        .archetype-info { flex: 1; min-width: 0; }
        .archetype-label {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--accent-primary);
        }
        .archetype-name {
          font-family: var(--font-display);
          font-size: 1.6rem;
          font-weight: 800;
          margin: 4px 0 8px;
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .archetype-desc {
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin-bottom: 12px;
        }
        .taste-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          overflow: hidden;
          max-height: 60px;
        }
        .taste-tag {
          font-size: 0.72rem;
          font-weight: 600;
          padding: 3px 10px;
          border: 1px solid;
          border-radius: 16px;
          background: rgba(0,0,0,0.2);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .mood-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          margin-bottom: 16px;
          background: linear-gradient(135deg, rgba(0,212,255,0.05), rgba(124,92,252,0.05));
          border: 1px solid var(--border-color);
        }
        .mood-icon { font-size: 2rem; flex-shrink: 0; }
        .mood-info { flex: 1; min-width: 0; }
        .mood-label { font-size: 0.72rem; color: var(--text-tertiary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
        .mood-suggestion { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); margin: 4px 0; }
        .mood-score { font-size: 0.78rem; color: var(--accent-primary); font-weight: 600; }

        .diversity-section { margin-bottom: 16px; }
        .diversity-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 20px;
          flex-wrap: wrap;
        }
        .diversity-info { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 150px; }
        .diversity-label { font-size: 0.85rem; font-weight: 600; white-space: nowrap; }
        .diversity-bar { flex: 1; height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden; min-width: 80px; }
        .diversity-fill { height: 100%; border-radius: 3px; transition: width 0.8s ease; }
        .diversity-score { font-weight: 800; font-family: var(--font-display); color: var(--accent-primary); font-size: 0.95rem; }
        .diversity-desc { font-size: 0.75rem; color: var(--text-tertiary); width: 100%; margin-top: 4px; }

        .taste-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        .radar-card, .breakdown-card {
          padding: 24px;
          overflow: hidden;
        }
        .radar-container {
          overflow: hidden;
          max-width: 400px;
          margin: 0 auto;
        }
        .radar-title {
          font-family: var(--font-display);
          font-size: 1.05rem;
          margin-bottom: 16px;
        }
        .radar-svg {
          width: 100%;
          max-width: 400px;
          margin: 0 auto;
          display: block;
          overflow: visible;
        }
        .dim-row { margin-bottom: 14px; }
        .dim-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
          font-size: 0.85rem;
        }
        .dim-label { font-weight: 600; }
        .dim-score { color: var(--accent-primary); font-weight: 700; }
        .dim-bar {
          height: 8px;
          background: var(--bg-secondary);
          border-radius: 4px;
          overflow: hidden;
        }
        .dim-bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .section-title {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 700;
          margin-bottom: 16px;
        }
        .compatibility-section {
          margin-bottom: 24px;
        }
        .compat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 12px;
        }
        .compat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 12px;
          text-align: center;
        }
        .compat-ring {
          width: 80px;
          height: 80px;
          margin-bottom: 8px;
        }
        .compat-name {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .fun-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 12px;
        }
        .fun-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 12px;
          text-align: center;
        }
        .fun-stat-value {
          font-family: var(--font-display);
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--accent-primary);
        }
        .fun-stat-label {
          font-size: 0.78rem;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        /* Share Card */
        .share-card-preview {
          border-radius: var(--radius-lg);
          overflow: hidden;
        }
        .share-card-bg {
          background: linear-gradient(135deg, #0a0a1a, #1a1a3e);
          padding: 24px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
        }
        .share-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .share-card-logo {
          font-family: var(--font-display);
          font-weight: 800;
          font-size: 0.9rem;
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .share-card-title {
          font-size: 0.75rem;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .share-card-archetype {
          text-align: center;
          margin-bottom: 16px;
        }
        .share-card-emoji { font-size: 2.5rem; display: block; margin-bottom: 8px; }
        .share-card-name {
          font-family: var(--font-display);
          font-size: 1.3rem;
          font-weight: 800;
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .share-card-stats {
          display: flex;
          justify-content: center;
          gap: 24px;
          margin-bottom: 16px;
        }
        .share-stat { text-align: center; }
        .share-stat-val {
          display: block;
          font-size: 1.2rem;
          font-weight: 800;
          font-family: var(--font-display);
          color: var(--accent-primary);
        }
        .share-stat-lbl {
          font-size: 0.68rem;
          color: var(--text-tertiary);
          text-transform: uppercase;
        }
        .share-card-dims {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .share-dim {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.78rem;
        }
        .share-dim span:first-child { width: 80px; text-align: right; }
        .share-dim-bar {
          flex: 1;
          height: 6px;
          background: rgba(255,255,255,0.06);
          border-radius: 3px;
          overflow: hidden;
        }
        .share-dim span:last-child {
          width: 36px;
          text-align: right;
          font-weight: 700;
          color: var(--accent-primary);
        }

        @media (max-width: 768px) {
          .taste-layout { grid-template-columns: 1fr; }
          .archetype-card { flex-direction: column; text-align: center; padding: 16px; }
          .taste-tags { justify-content: center; }
          .archetype-name { font-size: 1.3rem; }
          .archetype-desc { font-size: 0.82rem; }
          .mood-card { flex-direction: column; text-align: center; padding: 14px; }
          .otaku-level-header { flex-wrap: wrap; }
          .compat-grid { grid-template-columns: repeat(2, 1fr); }
          .fun-stats { grid-template-columns: repeat(2, 1fr); }
          .radar-card { padding: 14px; }
          .breakdown-card { padding: 14px; }
          .diversity-card { flex-direction: column; text-align: center; }
          .diversity-info { justify-content: center; }
          .fun-stat-value { font-size: 1.3rem; }
          .share-btn { top: 8px; right: 8px; }
          .share-dim span:first-child { width: 60px; font-size: 0.7rem; }
        }

        @media (max-width: 480px) {
          .compat-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .compat-card { padding: 12px 8px; }
          .compat-ring { width: 60px; height: 60px; }
          .fun-stats { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .fun-stat { padding: 14px 8px; }
          .fun-stat-value { font-size: 1.2rem; }
        }
      `}</style>
        </div>
    );
}
