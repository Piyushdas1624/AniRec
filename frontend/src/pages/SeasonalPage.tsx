import { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, Star } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import SmartImage from '../components/SmartImage';

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const SEASON_EMOJIS: Record<string, string> = { WINTER: '❄️', SPRING: '🌸', SUMMER: '☀️', FALL: '🍂' };

function getCurrentSeason(): string {
    const month = new Date().getMonth();
    if (month < 3) return 'WINTER';
    if (month < 6) return 'SPRING';
    if (month < 9) return 'SUMMER';
    return 'FALL';
}

export default function SeasonalPage() {
    const [season, setSeason] = useState(getCurrentSeason());
    const [year, setYear] = useState(new Date().getFullYear());
    const [anime, setAnime] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSeasonal();
    }, [season, year]);

    const loadSeasonal = async () => {
        setLoading(true);
        try {
            const { anime: data } = await api.getSeasonal(season, year);
            setAnime(data);
        } catch (err: any) {
            toast.error('Failed to load seasonal anime');
        } finally {
            setLoading(false);
        }
    };

    const nextSeason = () => {
        const idx = SEASONS.indexOf(season);
        if (idx === 3) { setSeason('WINTER'); setYear(y => y + 1); }
        else setSeason(SEASONS[idx + 1]);
    };

    const prevSeason = () => {
        const idx = SEASONS.indexOf(season);
        if (idx === 0) { setSeason('FALL'); setYear(y => y - 1); }
        else setSeason(SEASONS[idx - 1]);
    };

    const addToList = async (animeId: number) => {
        try {
            await api.addToList(animeId);
            toast.success('Added to list!');
        } catch (err: any) {
            if (err.message?.includes('already')) toast('Already in your list', { icon: 'ℹ️' });
            else toast.error('Failed to add');
        }
    };

    return (
        <div className="page">
            <div className="page-header animate-slide-up">
                <h1 className="page-title"><Calendar size={28} style={{ marginRight: 8 }} /> Seasonal Browser</h1>
                <p className="page-subtitle">Browse anime by season and year</p>
            </div>

            {/* Season Selector */}
            <div className="season-selector animate-fade-in">
                <button className="btn btn-icon btn-ghost" onClick={prevSeason}>
                    <ChevronLeft size={20} />
                </button>

                <div className="season-tabs">
                    {SEASONS.map(s => (
                        <button
                            key={s}
                            className={`season-tab ${season === s ? 'active' : ''}`}
                            onClick={() => setSeason(s)}
                        >
                            <span className="season-emoji">{SEASON_EMOJIS[s]}</span>
                            {s.charAt(0) + s.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>

                <button className="btn btn-icon btn-ghost" onClick={nextSeason}>
                    <ChevronRight size={20} />
                </button>
            </div>

            <div className="season-year-picker animate-fade-in">
                <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y - 1)}>← {year - 1}</button>
                <span className="season-current-year">{SEASON_EMOJIS[season]} {season.charAt(0) + season.slice(1).toLowerCase()} {year}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y + 1)}>{year + 1} →</button>
            </div>

            {loading ? (
                <div className="loading-container" style={{ minHeight: 200 }}>
                    <div className="spinner" />
                    <span className="loading-text">Loading {season.toLowerCase()} {year}...</span>
                </div>
            ) : anime.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📅</div>
                    <div className="empty-state-title">No anime found</div>
                    <p>This season may not have data yet.</p>
                </div>
            ) : (
                <div className="seasonal-grid animate-fade-in">
                    {anime.map(a => (
                        <div key={a.id} className="seasonal-card card">
                            <div className="seasonal-card-img-wrap">
                                <SmartImage src={a.coverImage} alt={a.title} className="seasonal-card-img" malId={a.malId} anilistId={a.anilistId} />
                                {a.averageScore && (
                                    <div className="seasonal-score">
                                        <Star size={10} fill="var(--warning)" color="var(--warning)" /> {a.averageScore}%
                                    </div>
                                )}
                            </div>
                            <div className="seasonal-card-body">
                                <h4 className="seasonal-card-title">{a.title}</h4>
                                <div className="seasonal-card-meta">
                                    {a.format && <span className="tag tag-sm">{a.format}</span>}
                                    {a.episodes && <span className="seasonal-ep">{a.episodes} ep</span>}
                                </div>
                                {a.genres && (
                                    <div className="seasonal-genres">
                                        {a.genres.slice(0, 3).map((g: string) => (
                                            <span key={g} className="tag tag-xs">{g}</span>
                                        ))}
                                    </div>
                                )}
                                <button
                                    className="btn btn-primary btn-sm seasonal-add-btn"
                                    onClick={(e) => { e.stopPropagation(); addToList(a.id); }}
                                >
                                    <Plus size={12} /> Add
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
        .season-selector {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .season-tabs {
          display: flex;
          gap: 4px;
          background: var(--bg-secondary);
          border-radius: var(--radius-lg);
          padding: 4px;
          border: 1px solid var(--border-color);
        }
        .season-tab {
          background: none;
          border: none;
          color: var(--text-secondary);
          padding: 8px 16px;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-weight: 500;
          font-size: 0.85rem;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .season-tab.active {
          background: var(--accent-primary);
          color: white;
          box-shadow: 0 2px 8px rgba(124,92,252,0.3);
        }
        .season-tab:hover:not(.active) { background: var(--bg-tertiary); }
        .season-emoji { font-size: 1rem; }
        .season-year-picker {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          margin-bottom: 24px;
        }
        .season-current-year {
          font-family: var(--font-display);
          font-size: 1.2rem;
          font-weight: 700;
        }

        .seasonal-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 16px;
        }
        .seasonal-card {
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .seasonal-card-img-wrap {
          position: relative;
          aspect-ratio: 2/3;
          overflow: hidden;
        }
        .seasonal-card-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s;
        }
        .seasonal-card:hover .seasonal-card-img {
          transform: scale(1.05);
        }
        .seasonal-score {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0,0,0,0.8);
          color: var(--warning);
          padding: 3px 8px;
          border-radius: 20px;
          font-size: 0.7rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .seasonal-card-body {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }
        .seasonal-card-title {
          font-size: 0.88rem;
          font-weight: 600;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .seasonal-card-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          color: var(--text-tertiary);
        }
        .seasonal-ep { font-weight: 500; }
        .seasonal-genres {
          display: flex;
          gap: 3px;
          flex-wrap: wrap;
        }
        .tag-xs {
          font-size: 0.65rem;
          padding: 1px 6px;
        }
        .seasonal-add-btn {
          margin-top: auto;
          width: 100%;
        }
        @media (max-width: 768px) {
          .season-selector { gap: 4px; }
          .season-tabs { gap: 2px; padding: 3px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
          .season-tabs::-webkit-scrollbar { display: none; }
          .season-tab { padding: 8px 12px; font-size: 0.78rem; white-space: nowrap; min-height: 40px; }
          .season-emoji { font-size: 0.85rem; }
          .season-year-picker { gap: 12px; }
          .season-current-year { font-size: 1rem; }
          .seasonal-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
          .seasonal-card-body { padding: 10px; gap: 4px; }
          .seasonal-card-title { font-size: 0.8rem; }
          .seasonal-card-meta { font-size: 0.68rem; }
        }
        @media (max-width: 480px) {
          .season-emoji { display: none; }
          .season-tab { padding: 6px 8px; font-size: 0.72rem; }
          .seasonal-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
        }
      `}</style>
        </div>
    );
}
