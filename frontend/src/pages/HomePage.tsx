import { useState, useEffect, useRef } from 'react';
import { TrendingUp, Star, Search, Plus, Sparkles, Shuffle, Award, Clock } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import AnimeDetailModal from '../components/AnimeDetailModal';
import SmartImage from '../components/SmartImage';

interface AnimeItem {
    id: number;
    anilistId?: number;
    malId?: number;
    title: string;
    titleRomaji?: string;
    coverImage: string;
    genres?: string[];
    episodes?: number;
    averageScore?: number;
    format?: string;
    status?: string;
}

export default function HomePage() {
    const { user } = useAuth();
    const [trending, setTrending] = useState<AnimeItem[]>([]);
    const [popular, setPopular] = useState<AnimeItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<AnimeItem[]>([]);
    const [searching, setSearching] = useState(false);
    const [loadingTrending, setLoadingTrending] = useState(true);
    const [loadingPopular, setLoadingPopular] = useState(true);
    const [activeTab, setActiveTab] = useState<'trending' | 'popular'>('trending');

    // Anime detail modal state
    const [detailAnimeId, setDetailAnimeId] = useState<number | null>(null);
    const [detailInitialData, setDetailInitialData] = useState<any>(null);

    // PC Feature 8: Search history
    const [searchHistory, setSearchHistory] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('anirec_search_history') || '[]'); }
        catch { return []; }
    });
    const [showHistory, setShowHistory] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Mobile Feature 6: Double-tap to add
    const lastTap = useRef<{ id: number; time: number }>({ id: 0, time: 0 });

    const handleDoubleTap = (anime: AnimeItem) => {
        const now = Date.now();
        if (lastTap.current.id === (anime.id || anime.anilistId || 0) && now - lastTap.current.time < 300) {
            // Double tap detected
            addToListQuick(anime.id || anime.anilistId || 0);
            lastTap.current = { id: 0, time: 0 };
        } else {
            lastTap.current = { id: anime.id || anime.anilistId || 0, time: now };
        }
    };

    const addToListQuick = async (animeId: number) => {
        try {
            await api.addToList(animeId);
            toast.success('⚡ Added to list!', { icon: '✅' });
        } catch (err: any) {
            if (err.message?.includes('already')) {
                toast('Already in your list', { icon: 'ℹ️' });
            }
        }
    };

    useEffect(() => {
        loadTrending();
        loadPopular();
    }, []);

    const loadTrending = async () => {
        try {
            const { anime } = await api.getTrending();
            setTrending(anime);
        } catch (err: any) {
            console.error('Failed to load trending:', err);
        } finally {
            setLoadingTrending(false);
        }
    };

    const loadPopular = async () => {
        try {
            const { anime } = await api.getPopular();
            setPopular(anime);
        } catch (err: any) {
            console.error('Failed to load popular:', err);
        } finally {
            setLoadingPopular(false);
        }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearching(true);
        setShowHistory(false);
        // Save to search history
        const updated = [searchQuery, ...searchHistory.filter(h => h !== searchQuery)].slice(0, 8);
        setSearchHistory(updated);
        localStorage.setItem('anirec_search_history', JSON.stringify(updated));
        try {
            const { anime } = await api.searchAnime(searchQuery);
            setSearchResults(anime);
        } catch (err: any) {
            toast.error(err.message || 'Search failed');
        } finally {
            setSearching(false);
        }
    };

    const clearSearchHistory = () => {
        setSearchHistory([]);
        localStorage.removeItem('anirec_search_history');
    };

    const addToList = async (animeId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.addToList(animeId);
            toast.success('Added to your list!');
        } catch (err: any) {
            if (err.message?.includes('already')) {
                toast.error('Already in your list');
            } else {
                toast.error(err.message || 'Failed to add');
            }
        }
    };

    const openAnimeDetail = (anime: AnimeItem) => {
        setDetailInitialData({
            title: anime.title,
            titleRomaji: anime.titleRomaji,
            coverImage: anime.coverImage,
            genres: anime.genres || [],
            episodes: anime.episodes,
            averageScore: anime.averageScore,
            format: anime.format,
            status: anime.status,
        });
        setDetailAnimeId(anime.id || anime.anilistId || 0);
    };

    const AnimeCard = ({ anime }: { anime: AnimeItem }) => {
        return (
            <div className="anime-card" onClick={() => openAnimeDetail(anime)} onTouchStart={() => handleDoubleTap(anime)}>
                <SmartImage
                    className="anime-card-image"
                    src={anime.coverImage}
                    alt={anime.title}
                    malId={anime.malId}
                    anilistId={anime.anilistId}
                />
                <div className="anime-card-overlay">
                    <div className="anime-card-title">{anime.title}</div>
                    <div className="anime-card-meta">
                        {anime.averageScore && (
                            <span className="anime-card-score">
                                <Star size={12} fill="currentColor" /> {(anime.averageScore / 10).toFixed(1)}
                            </span>
                        )}
                        {anime.format && <span>{anime.format}</span>}
                        {anime.episodes && <span>{anime.episodes} ep</span>}
                    </div>
                </div>
                <button
                    className="anime-card-add-btn"
                    onClick={(e) => addToList(anime.id || anime.anilistId || 0, e)}
                    title="Add to list"
                >
                    <Plus size={16} />
                </button>
            </div>
        );
    };

    const SkeletonCard = () => (
        <div className="anime-card">
            <div className="skeleton" style={{ aspectRatio: '2/3', width: '100%' }} />
        </div>
    );

    const displayAnime = searchResults.length > 0 ? searchResults : (activeTab === 'trending' ? trending : popular);
    const isLoading = activeTab === 'trending' ? loadingTrending : loadingPopular;

    // Greeting based on time of day
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="page">
            {/* Hero Section */}
            <div className="home-hero animate-slide-up">
                <h1 className="home-hero-title">
                    <Sparkles size={32} style={{ marginRight: 8, color: 'var(--accent-primary)' }} />
                    {greeting}, {user?.displayName || 'Otaku'}!
                </h1>
                <p className="home-hero-subtitle">
                    Discover your next favorite anime with AI-powered personalized recommendations
                </p>

                {/* Search */}
                <form className="home-search" onSubmit={handleSearch}>
                    <div className="search-bar-wrap" style={{ position: 'relative', flex: 1, maxWidth: '600px' }}>
                        <div className="search-bar" style={{ flex: 1 }}>
                            <Search size={18} className="search-bar-icon" />
                            <input
                                ref={searchInputRef}
                                className="input"
                                type="text"
                                placeholder="Search anime... (e.g., Attack on Titan, Steins;Gate)"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onFocus={() => searchHistory.length > 0 && setShowHistory(true)}
                                onBlur={() => setTimeout(() => setShowHistory(false), 200)}
                            />
                        </div>
                        {/* PC Feature 9: Search history dropdown */}
                        {showHistory && searchHistory.length > 0 && (
                            <div className="search-history-dropdown">
                                <div className="search-history-header">
                                    <span><Clock size={12} /> Recent Searches</span>
                                    <button className="btn btn-ghost btn-sm" onClick={clearSearchHistory} style={{ padding: '2px 6px', fontSize: '0.68rem' }}>
                                        Clear
                                    </button>
                                </div>
                                {searchHistory.map((term, i) => (
                                    <button key={i} className="search-history-item" onMouseDown={() => {
                                        setSearchQuery(term);
                                        setShowHistory(false);
                                        setTimeout(() => handleSearch({ preventDefault: () => { } } as any), 50);
                                    }}>
                                        <Clock size={12} /> {term}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={searching}>
                        {searching ? 'Searching...' : 'Search'}
                    </button>
                </form>
            </div>

            {/* Quick Actions */}
            <div className="home-actions animate-fade-in">
                <a className="action-card" href="/my-list">
                    <Star size={24} />
                    <span>My List</span>
                </a>
                <a className="action-card" href="/recommendations">
                    <Sparkles size={24} />
                    <span>Get Recommendations</span>
                </a>
                <a className="action-card" href="/random">
                    <Shuffle size={24} />
                    <span>Random Pick</span>
                </a>
                <a className="action-card" href="/taste">
                    <Award size={24} />
                    <span>Taste Profile</span>
                </a>
            </div>

            {/* Content */}
            {searchResults.length > 0 ? (
                <div className="page-header animate-fade-in">
                    <h2 className="page-title">Search Results</h2>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSearchResults([])}>
                        Clear results
                    </button>
                </div>
            ) : (
                <div className="flex items-center justify-between mb-4 animate-fade-in">
                    <div className="tabs">
                        <button
                            className={`tab ${activeTab === 'trending' ? 'active' : ''}`}
                            onClick={() => setActiveTab('trending')}
                        >
                            <TrendingUp size={14} /> Trending Now
                        </button>
                        <button
                            className={`tab ${activeTab === 'popular' ? 'active' : ''}`}
                            onClick={() => setActiveTab('popular')}
                        >
                            <Star size={14} /> Most Popular
                        </button>
                    </div>
                </div>
            )}

            <div className="anime-grid animate-fade-in">
                {isLoading && !searchResults.length
                    ? Array(12).fill(0).map((_, i) => <SkeletonCard key={i} />)
                    : displayAnime.map(anime => <AnimeCard key={anime.id || anime.anilistId} anime={anime} />)
                }
            </div>

            {displayAnime.length === 0 && !isLoading && (
                <div className="empty-state">
                    <div className="empty-state-icon">🔍</div>
                    <div className="empty-state-title">No anime found</div>
                    <p>Try a different search term</p>
                </div>
            )}

            {/* Anime Detail Modal */}
            {detailAnimeId && (
                <AnimeDetailModal
                    animeId={detailAnimeId}
                    initialData={detailInitialData}
                    onClose={() => { setDetailAnimeId(null); setDetailInitialData(null); }}
                />
            )}

            <style>{`
        .home-hero {
          text-align: center;
          padding: 48px 0 32px;
        }
        .home-hero-title {
          font-family: var(--font-display);
          font-size: 2.2rem;
          font-weight: 800;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .home-hero-subtitle {
          color: var(--text-secondary);
          font-size: 1.05rem;
          margin-bottom: 28px;
        }
        .home-search {
          display: flex;
          gap: 12px;
          justify-content: center;
          max-width: 700px;
          margin: 0 auto;
        }
        .home-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
          margin: 32px 0;
          flex-wrap: wrap;
        }
        .action-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 24px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          color: var(--text-primary);
          font-family: var(--font-sans);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-normal);
          backdrop-filter: blur(10px);
          text-decoration: none;
        }
        .action-card:hover {
          border-color: var(--accent-primary);
          background: rgba(124, 92, 252, 0.1);
          transform: translateY(-2px);
          box-shadow: var(--shadow-glow);
        }
        .action-card svg {
          color: var(--accent-primary);
        }
        .anime-card-add-btn {
          position: absolute;
          top: 8px;
          left: 8px;
          width: 30px;
          height: 30px;
          border-radius: var(--radius-full);
          background: rgba(0,0,0,0.6);
          border: 1px solid rgba(255,255,255,0.2);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: all var(--transition-fast);
          backdrop-filter: blur(4px);
        }
        .anime-card:hover .anime-card-add-btn {
          opacity: 1;
        }
        .anime-card-add-btn:hover {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
        }
        .anime-card-fallback {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: linear-gradient(135deg, #1a1a3e, #2d1b69);
          color: rgba(255,255,255,0.4);
          font-size: 2rem;
        }
        .fallback-title {
          font-size: 0.7rem;
          text-align: center;
          max-width: 80%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        /* PC Feature 10: Search history */
        .search-history-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          margin-top: 4px;
          z-index: 50;
          box-shadow: 0 8px 30px rgba(0,0,0,0.4);
          overflow: hidden;
        }
        .search-history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          font-size: 0.72rem;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--border-color);
        }
        .search-history-header span {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .search-history-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 10px 14px;
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 0.85rem;
          cursor: pointer;
          transition: background 0.12s;
          text-align: left;
          font-family: var(--font-sans);
        }
        .search-history-item:hover {
          background: rgba(124,92,252,0.1);
          color: var(--text-primary);
        }

        @media (max-width: 768px) {
          .home-hero {
            padding: 24px 0 20px;
          }
          .home-hero-title {
            font-size: 1.4rem;
            flex-wrap: wrap;
            gap: 4px;
          }
          .home-hero-subtitle {
            font-size: 0.88rem;
            margin-bottom: 20px;
          }
          .home-search {
            flex-direction: column;
            align-items: stretch;
          }
          .search-bar-wrap {
            max-width: 100% !important;
          }
          .home-actions {
            flex-direction: column;
            gap: 8px;
            margin: 20px 0;
          }
          .action-card {
            padding: 14px 18px;
            font-size: 0.85rem;
          }
          .anime-card-add-btn {
            opacity: 1;
            width: 34px;
            height: 34px;
          }
          /* Mobile Feature 7: Horizontal scrollable anime on mobile */
          .anime-grid {
            display: flex !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
            scroll-snap-type: x mandatory;
            gap: 12px;
            padding-bottom: 8px;
            grid-template-columns: unset !important;
          }
          .anime-grid::-webkit-scrollbar { display: none; }
          .anime-grid .anime-card {
            min-width: 140px;
            max-width: 160px;
            flex-shrink: 0;
            scroll-snap-align: start;
          }
        }
        @media (max-width: 480px) {
          .home-hero-title {
            font-size: 1.2rem;
          }
          .action-card {
            padding: 12px 14px;
            font-size: 0.8rem;
          }
          .action-card svg {
            width: 18px;
            height: 18px;
          }
          .anime-grid .anime-card {
            min-width: 120px;
            max-width: 140px;
          }
        }
        /* Touch devices - always show add button */
        @media (hover: none) {
          .anime-card-add-btn {
            opacity: 1;
          }
        }
      `}</style>
        </div>
    );
}
