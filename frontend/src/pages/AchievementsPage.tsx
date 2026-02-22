import { useState, useEffect } from 'react';
import { Award, Lock } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (stats: any) => boolean;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

const BADGES: Badge[] = [
  { id: 'first_anime', name: 'First Step', description: 'Add your first anime', icon: '👣', condition: s => s.totalAnime >= 1, rarity: 'common' },
  { id: 'ten_anime', name: 'Getting Started', description: 'Add 10 anime to your list', icon: '📋', condition: s => s.totalAnime >= 10, rarity: 'common' },
  { id: 'fifty_anime', name: 'Collector', description: 'Add 50 anime to your list', icon: '📚', condition: s => s.totalAnime >= 50, rarity: 'uncommon' },
  { id: 'hundred_anime', name: 'Centurion', description: 'Add 100 anime to your list', icon: '💯', condition: s => s.totalAnime >= 100, rarity: 'rare' },
  { id: 'five_hundred', name: 'Archivist', description: 'Add 500 anime to your list', icon: '🏛️', condition: s => s.totalAnime >= 500, rarity: 'legendary' },

  { id: 'first_complete', name: 'Finisher', description: 'Complete your first anime', icon: '✅', condition: s => (s.statusCounts?.completed || 0) >= 1, rarity: 'common' },
  { id: 'ten_complete', name: 'Dedicated', description: 'Complete 10 anime', icon: '🏆', condition: s => (s.statusCounts?.completed || 0) >= 10, rarity: 'uncommon' },
  { id: 'fifty_complete', name: 'Veteran', description: 'Complete 50 anime', icon: '⭐', condition: s => (s.statusCounts?.completed || 0) >= 50, rarity: 'rare' },
  { id: 'hundred_complete', name: 'Legend', description: 'Complete 100 anime', icon: '👑', condition: s => (s.statusCounts?.completed || 0) >= 100, rarity: 'epic' },

  { id: 'first_rate', name: 'Critic', description: 'Rate your first anime', icon: '📝', condition: s => s.totalRated >= 1, rarity: 'common' },
  { id: 'ten_rate', name: 'Reviewer', description: 'Rate 10 anime', icon: '⭐', condition: s => s.totalRated >= 10, rarity: 'uncommon' },
  { id: 'first_perfect', name: 'Masterpiece', description: 'Give a 10/10 rating', icon: '💎', condition: s => (s.ratingDistribution?.[10] || 0) >= 1, rarity: 'rare' },
  { id: 'harsh_critic', name: 'Harsh Critic', description: 'Average rating below 5', icon: '🧐', condition: s => s.averageRating > 0 && s.averageRating < 5, rarity: 'rare' },
  { id: 'generous', name: 'Generous Soul', description: 'Average rating above 8', icon: '😊', condition: s => s.averageRating >= 8, rarity: 'rare' },

  { id: 'first_fav', name: 'Heart', description: 'Mark your first favorite', icon: '❤️', condition: s => s.favoritesCount >= 1, rarity: 'common' },
  { id: 'ten_favs', name: 'Passionate', description: 'Mark 10 favorites', icon: '💕', condition: s => s.favoritesCount >= 10, rarity: 'uncommon' },

  { id: 'hundred_eps', name: 'Binge Watcher', description: 'Watch 100 episodes', icon: '📺', condition: s => s.totalEpisodesWatched >= 100, rarity: 'common' },
  { id: 'thousand_eps', name: 'Marathon Runner', description: 'Watch 1000 episodes', icon: '🏃', condition: s => s.totalEpisodesWatched >= 1000, rarity: 'rare' },
  { id: 'five_thousand_eps', name: 'Time Lord', description: 'Watch 5000 episodes', icon: '⏰', condition: s => s.totalEpisodesWatched >= 5000, rarity: 'legendary' },

  { id: 'genre_diverse', name: 'Genre Explorer', description: 'Watch anime from 8+ genres', icon: '🌍', condition: s => Object.keys(s.genreBreakdown || {}).length >= 8, rarity: 'uncommon' },
  { id: 'genre_master', name: 'Genre Master', description: 'Watch anime from 15+ genres', icon: '🎭', condition: s => Object.keys(s.genreBreakdown || {}).length >= 15, rarity: 'epic' },

  {
    id: 'format_diverse', name: 'Format Collector', description: 'Watch TV, Movie, OVA, and ONA', icon: '🎬', condition: s => {
      const formats = Object.keys(s.formatBreakdown || {});
      return ['TV', 'MOVIE', 'OVA', 'ONA'].every(f => formats.includes(f));
    }, rarity: 'rare'
  },
];

const RARITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  common: { bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)', text: '#9ca3af' },
  uncommon: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', text: '#22c55e' },
  rare: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6' },
  epic: { bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.3)', text: '#a855f7' },
  legendary: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
};

export default function AchievementsPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span className="loading-text">Loading achievements...</span>
      </div>
    );
  }

  const earned = BADGES.filter(b => stats && b.condition(stats));
  const locked = BADGES.filter(b => !stats || !b.condition(stats));

  return (
    <div className="page">
      <div className="page-header animate-slide-up">
        <h1 className="page-title"><Award size={28} style={{ marginRight: 8 }} /> Achievements</h1>
        <p className="page-subtitle">{earned.length}/{BADGES.length} badges earned</p>
      </div>

      {/* Progress bar */}
      <div className="achievement-progress animate-fade-in">
        <div className="achievement-progress-bar">
          <div
            className="achievement-progress-fill"
            style={{ width: `${(earned.length / BADGES.length) * 100}%` }}
          />
        </div>
        <span className="achievement-progress-text">{Math.round((earned.length / BADGES.length) * 100)}% Complete</span>
      </div>

      {/* Earned badges */}
      {earned.length > 0 && (
        <div className="badge-section animate-fade-in">
          <h2 className="badge-section-title">🏆 Earned ({earned.length})</h2>
          <div className="badge-grid">
            {earned.map(badge => {
              const rc = RARITY_COLORS[badge.rarity];
              return (
                <div key={badge.id} className="badge-card earned" style={{ background: rc.bg, borderColor: rc.border }}>
                  <div className="badge-icon">{badge.icon}</div>
                  <div className="badge-info">
                    <span className="badge-name">{badge.name}</span>
                    <span className="badge-desc">{badge.description}</span>
                    <span className="badge-rarity" style={{ color: rc.text }}>
                      {badge.rarity.charAt(0).toUpperCase() + badge.rarity.slice(1)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Locked badges */}
      {locked.length > 0 && (
        <div className="badge-section animate-fade-in">
          <h2 className="badge-section-title"><Lock size={16} /> Locked ({locked.length})</h2>
          <div className="badge-grid">
            {locked.map(badge => (
              <div key={badge.id} className="badge-card locked">
                <div className="badge-icon locked-icon">{badge.icon}</div>
                <div className="badge-info">
                  <span className="badge-name">{badge.name}</span>
                  <span className="badge-desc">{badge.description}</span>
                  <span className="badge-rarity" style={{ color: RARITY_COLORS[badge.rarity].text, opacity: 0.5 }}>
                    {badge.rarity.charAt(0).toUpperCase() + badge.rarity.slice(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .achievement-progress {
          margin-bottom: 28px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .achievement-progress-bar {
          flex: 1;
          height: 10px;
          background: var(--bg-secondary);
          border-radius: 5px;
          overflow: hidden;
          border: 1px solid var(--border-color);
        }
        .achievement-progress-fill {
          height: 100%;
          background: var(--accent-gradient);
          border-radius: 5px;
          transition: width 0.8s ease;
        }
        .achievement-progress-text {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
          white-space: nowrap;
        }
        .badge-section { margin-bottom: 30px; }
        .badge-section-title {
          font-family: var(--font-display);
          font-size: 1.1rem;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .badge-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
        }
        .badge-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          transition: transform 0.2s;
        }
        .badge-card.earned:hover {
          transform: translateY(-2px);
        }
        .badge-card.locked {
          background: var(--bg-secondary);
          opacity: 0.5;
        }
        .badge-icon {
          font-size: 2rem;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .locked-icon {
          filter: grayscale(1);
        }
        .badge-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .badge-name {
          font-weight: 700;
          font-size: 0.92rem;
        }
        .badge-desc {
          font-size: 0.78rem;
          color: var(--text-secondary);
        }
        .badge-rarity {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        @media (max-width: 768px) {
          .badge-grid { grid-template-columns: 1fr; gap: 8px; }
          .badge-card { padding: 12px; gap: 10px; }
          .badge-icon { font-size: 1.6rem; width: 40px; height: 40px; }
          .badge-name { font-size: 0.85rem; }
          .badge-desc { font-size: 0.72rem; }
          .achievement-progress { gap: 8px; }
          .achievement-progress-bar { height: 8px; }
          .achievement-progress-text { font-size: 0.78rem; }
          .badge-section-title { font-size: 0.95rem; }
        }
        @media (max-width: 480px) {
          .badge-grid { grid-template-columns: 1fr; }
          .badge-card { padding: 10px; gap: 8px; }
          .badge-icon { font-size: 1.3rem; width: 34px; height: 34px; }
        }
      `}</style>
    </div>
  );
}
