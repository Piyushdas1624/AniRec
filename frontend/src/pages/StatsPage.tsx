import { useState, useEffect } from 'react';
import { BarChart3, Star, Heart, Eye, Clock, CheckCircle, TrendingUp, Trophy, Film, ChevronRight, X } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import AnimeDetailModal from '../components/AnimeDetailModal';
import SmartImage from '../components/SmartImage';

export default function StatsPage() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [detailAnimeId, setDetailAnimeId] = useState<number | null>(null);
    const [detailInitialData, setDetailInitialData] = useState<any>(null);
    const [expandedFormat, setExpandedFormat] = useState<string | null>(null);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const data = await api.getStats();
            setStats(data);
        } catch (err: any) {
            toast.error('Failed to load stats');
        } finally {
            setLoading(false);
        }
    };

    const openAnimeDetail = (anime: any) => {
        setDetailInitialData({
            title: anime.title,
            coverImage: anime.coverImage,
            genres: anime.genres || [],
            averageScore: anime.averageScore,
            format: anime.format,
        });
        setDetailAnimeId(anime.animeId || anime.id);
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner" />
                <span className="loading-text">Crunching your stats...</span>
            </div>
        );
    }

    if (!stats) return null;

    const maxGenreCount = Math.max(...Object.values(stats.genreBreakdown || {}).map(Number), 1);
    const topGenres = Object.entries(stats.genreBreakdown || {})
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 12);

    const watchTimeHours = Math.round((stats.totalEpisodesWatched || 0) * 24 / 60);
    const watchTimeDays = (watchTimeHours / 24).toFixed(1);

    const genreColors: Record<string, string> = {
        'Action': '#ef4444', 'Adventure': '#f59e0b', 'Comedy': '#22c55e', 'Drama': '#3b82f6',
        'Fantasy': '#a855f7', 'Horror': '#991b1b', 'Mecha': '#6366f1', 'Music': '#ec4899',
        'Mystery': '#14b8a6', 'Psychological': '#8b5cf6', 'Romance': '#f472b6', 'Sci-Fi': '#06b6d4',
        'Slice of Life': '#84cc16', 'Sports': '#f97316', 'Supernatural': '#7c3aed', 'Thriller': '#dc2626',
    };

    // Milestone badges based on stats
    const milestones = [];
    if (stats.totalAnime >= 100) milestones.push({ icon: '🏆', label: 'Century Club', desc: '100+ anime' });
    if (stats.totalAnime >= 50) milestones.push({ icon: '⭐', label: 'Dedicated Viewer', desc: '50+ anime' });
    if (stats.favoritesCount >= 10) milestones.push({ icon: '❤️', label: 'Big Heart', desc: '10+ favorites' });
    if (watchTimeHours >= 100) milestones.push({ icon: '⏰', label: 'Time Lord', desc: '100+ hours watched' });
    if (Object.keys(stats.genreBreakdown || {}).length >= 10) milestones.push({ icon: '🌈', label: 'Genre Explorer', desc: '10+ genres' });
    if ((stats.statusCounts?.completed || 0) >= 25) milestones.push({ icon: '✅', label: 'Completionist', desc: '25+ completed' });

    // Get format anime list
    const formatAnimeList = expandedFormat && stats.formatAnimeList
        ? stats.formatAnimeList[expandedFormat] || []
        : [];

    return (
        <div className="page">
            <div className="page-header animate-slide-up">
                <h1 className="page-title"><BarChart3 size={28} style={{ marginRight: 8 }} /> Your Stats</h1>
                <p className="page-subtitle">Insights into your anime journey</p>
            </div>

            {/* Overview cards */}
            <div className="stats-overview animate-fade-in">
                <div className="stat-card gradient-1">
                    <div className="stat-icon"><Film size={24} /></div>
                    <div className="stat-value">{stats.totalAnime}</div>
                    <div className="stat-label">Total Anime</div>
                </div>
                <div className="stat-card gradient-2">
                    <div className="stat-icon"><Eye size={24} /></div>
                    <div className="stat-value">{stats.totalEpisodesWatched}</div>
                    <div className="stat-label">Episodes Watched</div>
                </div>
                <div className="stat-card gradient-3">
                    <div className="stat-icon"><Clock size={24} /></div>
                    <div className="stat-value">{watchTimeHours}h</div>
                    <div className="stat-label">{watchTimeDays} days of anime</div>
                </div>
                <div className="stat-card gradient-4">
                    <div className="stat-icon"><Star size={24} /></div>
                    <div className="stat-value">{stats.averageRating || '—'}</div>
                    <div className="stat-label">Avg Rating</div>
                </div>
                <div className="stat-card gradient-5">
                    <div className="stat-icon"><Heart size={24} /></div>
                    <div className="stat-value">{stats.favoritesCount}</div>
                    <div className="stat-label">Favorites</div>
                </div>
                <div className="stat-card gradient-6">
                    <div className="stat-icon"><CheckCircle size={24} /></div>
                    <div className="stat-value">{stats.statusCounts?.completed || 0}</div>
                    <div className="stat-label">Completed</div>
                </div>
            </div>

            {/* Milestones */}
            {milestones.length > 0 && (
                <div className="milestones-row animate-fade-in">
                    {milestones.map((m, i) => (
                        <div key={i} className="milestone-badge">
                            <span className="milestone-icon">{m.icon}</span>
                            <div className="milestone-info">
                                <span className="milestone-label">{m.label}</span>
                                <span className="milestone-desc">{m.desc}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="stats-grid animate-fade-in">
                {/* Status Distribution */}
                <div className="card card-body">
                    <h3 className="stats-card-title">📊 Status Distribution</h3>
                    <div className="status-bars">
                        {[
                            { key: 'watching', label: 'Watching', color: 'var(--info)', icon: <Eye size={14} /> },
                            { key: 'completed', label: 'Completed', color: 'var(--success)', icon: <CheckCircle size={14} /> },
                            { key: 'planning', label: 'Planning', color: 'var(--warning)', icon: <Clock size={14} /> },
                            { key: 'paused', label: 'Paused', color: 'var(--text-tertiary)', icon: <Clock size={14} /> },
                            { key: 'dropped', label: 'Dropped', color: 'var(--error)', icon: <TrendingUp size={14} /> },
                        ].map(s => {
                            const count = stats.statusCounts?.[s.key] || 0;
                            const pct = stats.totalAnime > 0 ? (count / stats.totalAnime * 100) : 0;
                            return (
                                <div key={s.key} className="status-bar-row">
                                    <div className="status-bar-label">
                                        {s.icon} {s.label}
                                        <span className="status-bar-count">{count} ({pct.toFixed(0)}%)</span>
                                    </div>
                                    <div className="status-bar-track">
                                        <div className="status-bar-fill" style={{ width: `${pct}%`, background: s.color }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Rating Distribution */}
                <div className="card card-body">
                    <h3 className="stats-card-title">⭐ Rating Distribution</h3>
                    <div className="rating-chart">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => {
                            const count = stats.ratingDistribution?.[r] || 0;
                            const maxRating = Math.max(...Object.values(stats.ratingDistribution || {}).map(Number), 1);
                            const height = maxRating > 0 ? (count / maxRating * 100) : 0;
                            return (
                                <div key={r} className="rating-bar-col">
                                    <span className="rating-bar-count">{count}</span>
                                    <div className="rating-bar-wrapper">
                                        <div
                                            className="rating-bar"
                                            style={{
                                                height: `${Math.max(height, 4)}%`,
                                                background: r >= 8 ? 'var(--success)' : r >= 5 ? 'var(--warning)' : 'var(--error)',
                                            }}
                                        />
                                    </div>
                                    <span className="rating-bar-label">{r}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Genre Breakdown */}
                <div className="card card-body">
                    <h3 className="stats-card-title">🎭 Genre Breakdown</h3>
                    <div className="genre-bars">
                        {topGenres.map(([genre, count]) => {
                            const pct = (count as number) / maxGenreCount * 100;
                            return (
                                <div key={genre} className="genre-bar-row">
                                    <div className="genre-bar-label">
                                        {genre}
                                        <span className="genre-bar-count">{count as number}</span>
                                    </div>
                                    <div className="genre-bar-track">
                                        <div
                                            className="genre-bar-fill"
                                            style={{
                                                width: `${pct}%`,
                                                background: genreColors[genre] || 'var(--accent-primary)',
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Format breakdown - NOW CLICKABLE */}
                <div className="card card-body">
                    <h3 className="stats-card-title">📺 Format Breakdown</h3>
                    <div className="format-grid">
                        {Object.entries(stats.formatBreakdown || {}).map(([format, count]) => (
                            <div
                                key={format}
                                className={`format-item ${expandedFormat === format ? 'active' : ''}`}
                                onClick={() => setExpandedFormat(expandedFormat === format ? null : format)}
                                style={{ cursor: 'pointer' }}
                            >
                                <span className="format-count">{count as number}</span>
                                <span className="format-label">{format}</span>
                            </div>
                        ))}
                    </div>
                    {expandedFormat && (
                        <div className="format-expanded">
                            <div className="format-expanded-header">
                                <h4>{expandedFormat} Anime</h4>
                                <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setExpandedFormat(null)}>
                                    <X size={16} />
                                </button>
                            </div>
                            {formatAnimeList.length > 0 ? (
                                <div className="format-anime-list">
                                    {formatAnimeList.slice(0, 10).map((anime: any, i: number) => (
                                        <div key={i} className="format-anime-item" onClick={() => openAnimeDetail(anime)}>
                                            <SmartImage
                                                className="format-anime-img"
                                                src={anime.coverImage}
                                                alt={anime.title}
                                                malId={anime.malId}
                                                anilistId={anime.anilistId}
                                            />
                                            <span className="format-anime-title">{anime.title}</span>
                                            {anime.rating && (
                                                <span className="format-anime-score">
                                                    <Star size={11} fill="var(--warning)" color="var(--warning)" /> {anime.rating}
                                                </span>
                                            )}
                                            <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: 8 }}>
                                    Click on a format to see anime in that category
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Top Rated - NOW CLICKABLE */}
                <div className="card card-body">
                    <h3 className="stats-card-title"><Trophy size={16} /> Your Top Rated</h3>
                    <div className="top-rated-list">
                        {(stats.topRated || []).slice(0, 8).map((anime: any, i: number) => (
                            <div key={i} className="top-rated-item clickable" onClick={() => openAnimeDetail(anime)}>
                                <span className="top-rated-rank">#{i + 1}</span>
                                <SmartImage
                                    className="top-rated-img"
                                    src={anime.coverImage}
                                    alt={anime.title}
                                    malId={anime.malId}
                                    anilistId={anime.anilistId}
                                />
                                <span className="top-rated-title">{anime.title}</span>
                                <span className="top-rated-score">
                                    <Star size={12} fill="var(--warning)" color="var(--warning)" /> {anime.rating}
                                </span>
                                <ChevronRight size={14} className="top-rated-arrow" />
                            </div>
                        ))}
                        {(stats.topRated || []).length === 0 && (
                            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Rate some anime to see your top list!</p>
                        )}
                    </div>
                </div>

                {/* Recent Activity - NOW CLICKABLE */}
                <div className="card card-body">
                    <h3 className="stats-card-title">🕐 Recent Activity</h3>
                    <div className="activity-list">
                        {(stats.recentActivity || []).slice(0, 8).map((item: any, i: number) => (
                            <div key={i} className="activity-item clickable" onClick={() => openAnimeDetail(item)}>
                                <SmartImage
                                    className="activity-img"
                                    src={item.coverImage}
                                    alt={item.title}
                                    malId={item.malId}
                                    anilistId={item.anilistId}
                                />
                                <div className="activity-info">
                                    <span className="activity-title">{item.title}</span>
                                    <span className="activity-status">{item.status}</span>
                                </div>
                                <ChevronRight size={14} className="activity-arrow" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Anime Detail Modal */}
            {detailAnimeId && (
                <AnimeDetailModal
                    animeId={detailAnimeId}
                    initialData={detailInitialData}
                    onClose={() => { setDetailAnimeId(null); setDetailInitialData(null); }}
                    onListUpdated={loadStats}
                />
            )}

            <style>{`
        .stats-overview {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }
        .stat-card {
          border-radius: var(--radius-lg);
          padding: 20px;
          text-align: center;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s;
        }
        .stat-card:hover { transform: translateY(-2px); }
        .stat-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--glass-bg);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
        }
        .stat-icon { position: relative; color: rgba(255,255,255,0.8); margin-bottom: 8px; }
        .stat-value { position: relative; font-size: 1.8rem; font-weight: 800; font-family: var(--font-display); }
        .stat-label { position: relative; font-size: 0.78rem; color: var(--text-secondary); margin-top: 4px; }
        .gradient-1 { background: linear-gradient(135deg, rgba(124,92,252,0.2), rgba(124,92,252,0.05)); }
        .gradient-2 { background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.05)); }
        .gradient-3 { background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05)); }
        .gradient-4 { background: linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05)); }
        .gradient-5 { background: linear-gradient(135deg, rgba(255,107,157,0.2), rgba(255,107,157,0.05)); }
        .gradient-6 { background: linear-gradient(135deg, rgba(20,184,166,0.2), rgba(20,184,166,0.05)); }

        /* Milestones */
        .milestones-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }
        .milestone-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          transition: all 0.2s;
        }
        .milestone-badge:hover {
          border-color: var(--accent-primary);
          transform: translateY(-2px);
        }
        .milestone-icon { font-size: 1.5rem; }
        .milestone-info { display: flex; flex-direction: column; }
        .milestone-label { font-weight: 700; font-size: 0.85rem; }
        .milestone-desc { font-size: 0.72rem; color: var(--text-tertiary); }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: 20px;
        }
        .stats-card-title {
          font-family: var(--font-display);
          font-size: 1rem;
          font-weight: 700;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-bars { display: flex; flex-direction: column; gap: 12px; }
        .status-bar-row { display: flex; flex-direction: column; gap: 4px; }
        .status-bar-label { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 500; }
        .status-bar-count { margin-left: auto; color: var(--text-tertiary); font-size: 0.78rem; }
        .status-bar-track { height: 8px; background: var(--bg-primary); border-radius: 4px; overflow: hidden; }
        .status-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }

        .rating-chart { display: flex; align-items: flex-end; gap: 6px; height: 140px; }
        .rating-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
        .rating-bar-count { font-size: 0.7rem; color: var(--text-tertiary); margin-bottom: 4px; }
        .rating-bar-wrapper { flex: 1; width: 100%; display: flex; align-items: flex-end; }
        .rating-bar { width: 100%; border-radius: 4px 4px 0 0; transition: height 0.6s ease; min-height: 2px; }
        .rating-bar-label { font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; }

        .genre-bars { display: flex; flex-direction: column; gap: 10px; }
        .genre-bar-row { display: flex; flex-direction: column; gap: 3px; }
        .genre-bar-label { display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 500; }
        .genre-bar-count { color: var(--text-tertiary); font-size: 0.75rem; }
        .genre-bar-track { height: 6px; background: var(--bg-primary); border-radius: 3px; overflow: hidden; }
        .genre-bar-fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }

        .format-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; }
        .format-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 14px 8px;
          background: var(--bg-primary);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          transition: all 0.15s;
        }
        .format-item:hover, .format-item.active {
          border-color: var(--accent-primary);
          background: rgba(124,92,252,0.08);
          transform: translateY(-2px);
        }
        .format-count { font-size: 1.4rem; font-weight: 800; font-family: var(--font-display); color: var(--accent-primary); }
        .format-label { font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; }
        .format-expanded {
          margin-top: 16px;
          padding: 14px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
        }
        .format-expanded-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .format-expanded-header h4 {
          font-family: var(--font-display);
          font-size: 0.9rem;
        }
        .format-anime-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .format-anime-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background 0.15s;
        }
        .format-anime-item:hover {
          background: var(--bg-tertiary);
        }
        .format-anime-img {
          width: 28px;
          height: 38px;
          object-fit: cover;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .format-anime-title {
          flex: 1;
          font-size: 0.82rem;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .format-anime-score {
          display: flex;
          align-items: center;
          gap: 2px;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--warning);
        }

        .top-rated-list { display: flex; flex-direction: column; gap: 8px; }
        .top-rated-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 0;
          border-bottom: 1px solid var(--border-color);
        }
        .top-rated-item:last-child { border-bottom: none; }
        .top-rated-item.clickable {
          cursor: pointer;
          padding: 8px;
          border-radius: var(--radius-md);
          border-bottom: none;
          transition: background 0.15s;
        }
        .top-rated-item.clickable:hover {
          background: var(--bg-primary);
        }
        .top-rated-rank { font-weight: 800; font-size: 0.85rem; color: var(--accent-primary); width: 28px; }
        .top-rated-img { width: 32px; height: 44px; object-fit: cover; border-radius: 4px; }
        .top-rated-title { flex: 1; font-size: 0.85rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .top-rated-score { display: flex; align-items: center; gap: 3px; font-weight: 700; color: var(--warning); font-size: 0.85rem; }
        .top-rated-arrow { color: var(--text-tertiary); flex-shrink: 0; opacity: 0; transition: opacity 0.15s; }
        .top-rated-item.clickable:hover .top-rated-arrow { opacity: 1; }

        .activity-list { display: flex; flex-direction: column; gap: 8px; }
        .activity-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 0;
        }
        .activity-item.clickable {
          cursor: pointer;
          padding: 8px;
          border-radius: var(--radius-md);
          transition: background 0.15s;
        }
        .activity-item.clickable:hover {
          background: var(--bg-primary);
        }
        .activity-img { width: 32px; height: 44px; object-fit: cover; border-radius: 4px; }
        .activity-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        .activity-title { font-size: 0.85rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .activity-status { font-size: 0.75rem; color: var(--text-tertiary); text-transform: capitalize; }
        .activity-arrow { color: var(--text-tertiary); flex-shrink: 0; opacity: 0; transition: opacity 0.15s; }
        .activity-item.clickable:hover .activity-arrow { opacity: 1; }

        @media (max-width: 768px) {
          .stat-cards { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .stat-card { padding: 14px; }
          .stat-value { font-size: 1.3rem; }
          .stat-label { font-size: 0.68rem; }
          .stats-grid { grid-template-columns: 1fr; gap: 12px; }
          .stats-card-title { font-size: 0.9rem; margin-bottom: 12px; }
          .milestones-row { gap: 8px; }
          .milestone-badge { padding: 10px 12px; }
          .milestone-icon { font-size: 1.2rem; }
          .milestone-label { font-size: 0.78rem; }
          .milestone-desc { font-size: 0.65rem; }
          .format-grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 6px; }
          .format-count { font-size: 1.1rem; }
          .format-label { font-size: 0.68rem; }
          .format-item { padding: 10px 6px; }
          .rating-chart { height: 100px; gap: 3px; }
          .rating-bar-label { font-size: 0.65rem; }
          .rating-bar-count { font-size: 0.6rem; }
          .genre-bar-label { font-size: 0.75rem; }
          .top-rated-img { width: 28px; height: 38px; }
          .top-rated-title { font-size: 0.78rem; }
          .activity-img { width: 28px; height: 38px; }
          .activity-title { font-size: 0.78rem; }
        }
        @media (max-width: 480px) {
          .stat-cards { grid-template-columns: repeat(2, 1fr); gap: 6px; }
          .stat-card { padding: 10px; }
          .stat-value { font-size: 1.1rem; }
          .milestone-badge { flex-direction: column; text-align: center; padding: 10px 8px; }
        }
      `}</style>
        </div>
    );
}
