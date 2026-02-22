import { useState, useEffect, useRef } from 'react';
import { Shuffle, RotateCcw, Plus, Star, ExternalLink } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import SmartImage from '../components/SmartImage';

export default function RandomPickerPage() {
    const [pool, setPool] = useState<any[]>([]);
    const [source, setSource] = useState<'planning' | 'trending' | 'all'>('planning');
    const [spinning, setSpinning] = useState(false);
    const [picked, setPicked] = useState<any>(null);
    const [rotation, setRotation] = useState(0);
    const wheelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadPool();
    }, [source]);

    const loadPool = async () => {
        try {
            if (source === 'trending') {
                const { anime } = await api.getTrending();
                setPool(anime);
            } else {
                const { list } = await api.getMyList();
                if (source === 'planning') {
                    setPool(list.filter((item: any) => item.status === 'planning'));
                } else {
                    setPool(list);
                }
            }
        } catch {
            toast.error('Failed to load anime pool');
        }
    };

    const spin = () => {
        if (pool.length === 0) {
            toast.error('No anime in pool! Add some to your planning list first.');
            return;
        }

        setSpinning(true);
        setPicked(null);

        // Random number of spins (3-6 full rotations + random offset)
        const extraSpins = 3 + Math.floor(Math.random() * 4);
        const randomIndex = Math.floor(Math.random() * pool.length);
        const sliceDeg = 360 / pool.length;
        const targetDeg = rotation + (extraSpins * 360) + (randomIndex * sliceDeg) + (sliceDeg / 2);
        setRotation(targetDeg);

        setTimeout(() => {
            setPicked(pool[randomIndex]);
            setSpinning(false);
        }, 3500);
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

    // Generate wheel slices
    const sliceAngle = pool.length > 0 ? 360 / Math.min(pool.length, 20) : 360;
    const displayPool = pool.slice(0, 20);
    const colors = [
        '#7c5cfc', '#ff6b9d', '#00b4d8', '#22c55e', '#f59e0b',
        '#e879f9', '#34d399', '#fb923c', '#818cf8', '#f472b6',
        '#2dd4bf', '#84cc16', '#06b6d4', '#a855f7', '#ef4444',
        '#3b82f6', '#facc15', '#ec4899', '#14b8a6', '#f97316',
    ];

    return (
        <div className="page">
            <div className="page-header animate-slide-up">
                <h1 className="page-title"><Shuffle size={28} style={{ marginRight: 8 }} /> Random Anime Picker</h1>
                <p className="page-subtitle">Can't decide what to watch? Let fate choose!</p>
            </div>

            {/* Source selector */}
            <div className="tabs mb-4 animate-fade-in" style={{ justifyContent: 'center' }}>
                <button className={`tab ${source === 'planning' ? 'active' : ''}`} onClick={() => setSource('planning')}>
                    📋 My Planning ({pool.length})
                </button>
                <button className={`tab ${source === 'all' ? 'active' : ''}`} onClick={() => setSource('all')}>
                    📚 All My List
                </button>
                <button className={`tab ${source === 'trending' ? 'active' : ''}`} onClick={() => setSource('trending')}>
                    🔥 Trending
                </button>
            </div>

            {/* Wheel area */}
            <div className="wheel-container animate-fade-in">
                <div className="wheel-pointer">▼</div>
                <svg
                    ref={wheelRef as any}
                    className="wheel"
                    viewBox="0 0 320 320"
                    style={{
                        transform: `rotate(${rotation}deg)`,
                        transition: spinning ? 'transform 3.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
                    }}
                >
                    {displayPool.length > 0 ? (
                        displayPool.map((anime, i) => {
                            const startAngle = i * sliceAngle;
                            const endAngle = startAngle + sliceAngle;
                            const startRad = (startAngle - 90) * Math.PI / 180;
                            const endRad = (endAngle - 90) * Math.PI / 180;
                            const largeArc = sliceAngle > 180 ? 1 : 0;
                            const r = 150;
                            const cx = 160, cy = 160;

                            const x1 = cx + r * Math.cos(startRad);
                            const y1 = cy + r * Math.sin(startRad);
                            const x2 = cx + r * Math.cos(endRad);
                            const y2 = cy + r * Math.sin(endRad);

                            const textAngle = startAngle + sliceAngle / 2;
                            const textRad = (textAngle - 90) * Math.PI / 180;
                            const textR = r * 0.65;
                            const textX = cx + textR * Math.cos(textRad);
                            const textY = cy + textR * Math.sin(textRad);

                            const title = anime.title || anime.titleRomaji || '?';
                            const shortTitle = title.length > 14 ? title.substring(0, 12) + '…' : title;

                            return (
                                <g key={i}>
                                    <path
                                        d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`}
                                        fill={colors[i % colors.length]}
                                        stroke="rgba(0,0,0,0.3)"
                                        strokeWidth="1"
                                    />
                                    <text
                                        x={textX}
                                        y={textY}
                                        fill="white"
                                        fontSize={sliceAngle < 30 ? "7" : "9"}
                                        fontWeight="600"
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        transform={`rotate(${textAngle}, ${textX}, ${textY})`}
                                    >
                                        {shortTitle}
                                    </text>
                                </g>
                            );
                        })
                    ) : (
                        <circle cx={160} cy={160} r={150} fill="var(--bg-secondary)" stroke="var(--border-color)" strokeWidth="2" />
                    )}
                    <circle cx={160} cy={160} r={30} fill="var(--bg-primary)" stroke="var(--border-color)" strokeWidth="2" />
                    <text x={160} y={164} fill="var(--text-primary)" fontSize="14" fontWeight="800" textAnchor="middle">
                        {displayPool.length > 0 ? '🎲' : '∅'}
                    </text>
                </svg>
            </div>

            {/* Spin button */}
            <div className="wheel-actions animate-fade-in">
                <button
                    className="btn btn-gradient btn-lg"
                    onClick={spin}
                    disabled={spinning || pool.length === 0}
                    style={{ minWidth: 200 }}
                >
                    {spinning ? (
                        <><RotateCcw size={18} className="spinning" /> Spinning...</>
                    ) : (
                        <><Shuffle size={18} /> Spin the Wheel!</>
                    )}
                </button>
            </div>

            {/* Result */}
            {picked && (
                <div className="picked-result card animate-fade-in">
                    <SmartImage src={picked.coverImage} alt={picked.title} className="picked-img" malId={picked.malId} anilistId={picked.anilistId} />
                    <div className="picked-info">
                        <h2 className="picked-title">🎉 You should watch:</h2>
                        <h3 className="picked-name">{picked.title}</h3>
                        <div className="picked-meta">
                            {picked.format && <span className="tag">{picked.format}</span>}
                            {picked.episodes && <span>{picked.episodes} episodes</span>}
                            {picked.averageScore && (
                                <span className="picked-score">
                                    <Star size={14} fill="var(--warning)" color="var(--warning)" /> {picked.averageScore}%
                                </span>
                            )}
                        </div>
                        {picked.genres && picked.genres.length > 0 && (
                            <div className="picked-genres">
                                {picked.genres.map((g: string) => <span key={g} className="tag tag-sm">{g}</span>)}
                            </div>
                        )}
                        <div className="flex gap-2 mt-3">
                            {source === 'trending' && (
                                <button className="btn btn-primary btn-sm" onClick={() => addToList(picked.id)}>
                                    <Plus size={14} /> Add to My List
                                </button>
                            )}
                            {picked.anilistId && (
                                <a href={`https://anilist.co/anime/${picked.anilistId}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                                    <ExternalLink size={14} /> View on AniList
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .wheel-container {
          display: flex;
          justify-content: center;
          position: relative;
          padding: 20px 0;
        }
        .wheel {
          width: 320px;
          height: 320px;
          border-radius: 50%;
          overflow: visible;
          filter: drop-shadow(0 4px 30px rgba(124,92,252,0.3));
        }
        .wheel svg, .wheel {
          width: 320px;
          height: 320px;
        }
        .wheel-pointer {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 2rem;
          color: var(--accent-primary);
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
          z-index: 5;
        }
        .wheel-actions {
          display: flex;
          justify-content: center;
          margin: 20px 0;
        }
        .picked-result {
          display: flex;
          gap: 20px;
          padding: 24px;
          max-width: 600px;
          margin: 0 auto;
          border: 2px solid var(--accent-primary);
          animation: popIn 0.4s ease;
        }
        .picked-img {
          width: 120px;
          height: 170px;
          object-fit: cover;
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }
        .picked-info { flex: 1; }
        .picked-title {
          font-family: var(--font-display);
          font-size: 0.9rem;
          color: var(--accent-primary);
          margin-bottom: 4px;
        }
        .picked-name {
          font-family: var(--font-display);
          font-size: 1.3rem;
          margin-bottom: 10px;
        }
        .picked-meta {
          display: flex;
          gap: 10px;
          align-items: center;
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .picked-score {
          display: flex;
          align-items: center;
          gap: 3px;
          color: var(--warning);
          font-weight: 600;
        }
        .picked-genres {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .wheel, .wheel svg { width: 280px; height: 280px; }
          .picked-result { flex-direction: column; align-items: center; text-align: center; padding: 16px; }
          .picked-img { width: 100px; height: 140px; }
          .picked-name { font-size: 1.1rem; }
          .picked-meta { flex-wrap: wrap; justify-content: center; gap: 6px; font-size: 0.8rem; }
          .picked-genres { justify-content: center; }
        }
        @media (max-width: 480px) {
          .wheel, .wheel svg { width: 240px; height: 240px; }
          .picked-img { width: 80px; height: 115px; }
          .picked-name { font-size: 0.95rem; }
          .wheel-pointer { font-size: 1.5rem; }
        }
      `}</style>
        </div>
    );
}
