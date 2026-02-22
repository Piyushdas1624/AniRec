import { useState, useEffect } from 'react';
import {
  X, Star, Plus, Edit3, Calendar, Tag, BookOpen, Eye, CheckCircle,
  Clock, ChevronRight, ExternalLink, MessageSquare, Film, Tv, Play, Copy, RefreshCw, ArrowLeft, ArrowRight
} from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import SmartImage from './SmartImage';

interface AnimeDetailModalProps {
  animeId: number | null;
  onClose: () => void;
  initialData?: any;
  onListUpdated?: () => void;
  onNavigate?: (direction: 'next' | 'prev') => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

const STATUS_OPTIONS = [
  { key: 'watching', label: 'Watching', icon: <Eye size={14} />, color: '#3b82f6' },
  { key: 'rewatching', label: 'Rewatching', icon: <RefreshCw size={14} />, color: '#8b5cf6' },
  { key: 'completed', label: 'Completed', icon: <CheckCircle size={14} />, color: '#22c55e' },
  { key: 'planning', label: 'Plan to Watch', icon: <Clock size={14} />, color: '#f59e0b' },
  { key: 'paused', label: 'Paused', icon: <BookOpen size={14} />, color: '#8b8b8b' },
  { key: 'dropped', label: 'Dropped', icon: <X size={14} />, color: '#ef4444' },
];

const FORMAT_ICONS: Record<string, React.ReactNode> = {
  TV: <Tv size={14} />,
  MOVIE: <Film size={14} />,
  OVA: <Play size={14} />,
  ONA: <Play size={14} />,
  SPECIAL: <Star size={14} />,
};

export default function AnimeDetailModal({ animeId: initialAnimeId, onClose, initialData, onListUpdated, onNavigate, hasNext, hasPrev }: AnimeDetailModalProps) {
  // Internal anime ID state — allows navigating to relations without closing modal
  const [currentAnimeId, setCurrentAnimeId] = useState<number | null>(initialAnimeId);
  const [anime, setAnime] = useState<any>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [listEntry, setListEntry] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editRating, setEditRating] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('planning');
  const [editEpisodes, setEditEpisodes] = useState(0);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Navigation history for back button
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    if (!currentAnimeId) return;
    loadAnime(currentAnimeId);
  }, [currentAnimeId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!isEditing && onNavigate) {
        if (e.key === 'ArrowRight' && hasNext) onNavigate('next');
        if (e.key === 'ArrowLeft' && hasPrev) onNavigate('prev');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNavigate, hasNext, hasPrev, isEditing]);

  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [trailerData, setTrailerData] = useState<any>(null);

  const loadAnime = async (id: number) => {
    setLoading(true);
    setIsEditing(false);
    setImgError(false);
    try {
      const data = await api.getAnime(id);
      setAnime(data.anime || data);
      if (data.listEntry) {
        setListEntry(data.listEntry);
        populateEditFields(data.listEntry);
      } else {
        setListEntry(null);
      }

      // Feature: Dynamic Jikan Trailer Fetch
      if (data.anime?.mal_id || data.anime?.malId) {
        const malId = data.anime?.mal_id || data.anime?.malId;
        fetch(`https://api.jikan.moe/v4/anime/${malId}/videos`)
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(res => {
            if (res.data?.promo?.[0]?.trailer?.youtube_id) {
              setTrailerData(res.data.promo[0].trailer.youtube_id);
            } else {
              setTrailerData(null);
            }
          }).catch(() => setTrailerData(null));
      } else {
        setTrailerData(null);
      }
    } catch (err: any) {
      // If fetch fails, keep whatever data we have
      if (!anime && initialData) {
        setAnime(initialData);
      }
    } finally {
      setLoading(false);
    }
  };

  const populateEditFields = (entry: any) => {
    setEditRating(entry.rating || 0);
    setEditNotes(entry.notes || '');
    setEditStatus(entry.status || 'planning');
    setEditEpisodes(entry.episodesWatched || 0);
    setEditStartDate(entry.startDate || '');
    setEditEndDate(entry.endDate || '');
    setEditTags(Array.isArray(entry.tags) ? entry.tags.join(', ') : (entry.tags || ''));
  };

  const handleAddToList = async (status = 'planning') => {
    if (!currentAnimeId) return;
    try {
      const result = await api.addToList(currentAnimeId, status);
      setListEntry(result.entry || { id: result.id, status });
      toast.success('Added to your list!');
      onListUpdated?.();
    } catch (err: any) {
      if (err.message?.includes('already')) {
        toast.error('Already in your list');
      } else {
        toast.error(err.message || 'Failed to add');
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!listEntry?.id) return;
    setSaving(true);
    try {
      await api.updateListItem(listEntry.id, {
        rating: editRating || undefined,
        notes: editNotes || undefined,
        status: editStatus,
        episodesWatched: editEpisodes,
        startDate: editStartDate || undefined,
        endDate: editEndDate || undefined,
        tags: editTags ? editTags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
      });
      setListEntry((prev: any) => ({
        ...prev,
        rating: editRating,
        notes: editNotes,
        status: editStatus,
        episodesWatched: editEpisodes,
        startDate: editStartDate,
        endDate: editEndDate,
        tags: editTags.split(',').map((t: string) => t.trim()).filter(Boolean),
      }));
      setIsEditing(false);
      toast.success('Updated!');
      if (editStatus === 'completed' && listEntry.status !== 'completed') {
        toast('🎉 Congratulations on finishing!', { icon: '✨', duration: 4000 });
      }
      onListUpdated?.();
    } catch (err: any) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!listEntry?.id || !confirm('Remove this anime from your list?')) return;
    try {
      await api.removeFromList(listEntry.id);
      setListEntry(null);
      toast.success('Removed from list');
      onListUpdated?.();
    } catch {
      toast.error('Failed to remove');
    }
  };

  // Navigate to a related anime
  const navigateToAnime = (relAnimeId: number) => {
    if (currentAnimeId) {
      setHistory(prev => [...prev, currentAnimeId]);
    }
    setAnime(null);
    setListEntry(null);
    setCurrentAnimeId(relAnimeId);
  };

  const goBack = () => {
    if (history.length > 0) {
      const prevId = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1));
      setAnime(null);
      setListEntry(null);
      setCurrentAnimeId(prevId);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!currentAnimeId) return null;

  const a = anime || initialData || {};
  const coverUrl = a.coverImage || a.cover_image || '';
  const bannerUrl = a.bannerImage || a.banner_image || '';
  const title = a.title || a.titleEnglish || a.title_english || 'Loading...';
  const titleRomaji = a.titleRomaji || a.title_romaji || '';
  const synopsis = a.synopsis || a.description || '';
  const genres = a.genres || [];
  const score = a.averageScore || a.average_score || a.mean_score;
  const format = a.format || '';
  const episodes = a.episodes || a.total_episodes;
  const airingStatus = a.airingStatus || a.status || '';
  const season = a.season || '';
  const year = a.seasonYear || a.season_year || a.year || '';
  const studio = Array.isArray(a.studios) ? a.studios[0] : '';
  const relations = a.relations || [];

  return (
    <div className="anime-detail-overlay" onClick={onClose}>
      <div className="anime-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Back button for relation navigation */}
        {history.length > 0 && (
          <button className="adm-back" onClick={goBack}>
            ← Back
          </button>
        )}

        {/* Banner */}
        {bannerUrl && !imgError && (
          <div className="adm-banner">
            <img src={bannerUrl} alt="" onError={() => setImgError(true)} />
            <div className="adm-banner-fade" />
          </div>
        )}

        {/* Close button */}
        <button className="adm-close" onClick={onClose}>
          <X size={20} />
        </button>

        {loading ? (
          <div className="adm-loading">
            <div className="spinner" />
            <span>Loading anime details...</span>
          </div>
        ) : (
          <div className="adm-content">
            {/* Gallery Navigation UI hints */}
            {onNavigate && (
              <>
                {hasPrev && <button className="modal-nav left" onClick={() => onNavigate('prev')}><ArrowLeft size={24} /></button>}
                {hasNext && <button className="modal-nav right" onClick={() => onNavigate('next')}><ArrowRight size={24} /></button>}
              </>
            )}

            {/* Header */}
            <div className="adm-header">
              <div
                className="adm-cover-wrap"
                onDoubleClick={() => (!isEditing && listEntry) ? (populateEditFields(listEntry), setIsEditing(true)) : handleAddToList('planning')}
                title={listEntry ? "Double click to edit" : "Double click to quick add"}
                style={{ cursor: 'pointer' }}
              >
                <SmartImage
                  className="adm-cover"
                  src={coverUrl}
                  alt={title}
                  malId={a.mal_id || a.malId}
                  anilistId={a.anilist_id || a.anilistId || currentAnimeId}
                />
                {score && (
                  <div className="adm-score-badge">
                    <Star size={12} fill="currentColor" />
                    <span>{(score / 10).toFixed(1)}</span>
                  </div>
                )}
              </div>
              <div className="adm-info">
                <h2 className="adm-title">{title}</h2>
                {titleRomaji && titleRomaji !== title && (
                  <p
                    className="adm-romaji cursor-pointer hover:text-accent-primary"
                    title="Click to copy"
                    onClick={() => {
                      navigator.clipboard.writeText(titleRomaji);
                      toast.success('Romaji title copied!');
                    }}
                  >
                    {titleRomaji} <Copy size={12} className="inline ml-1 opacity-50" />
                  </p>
                )}
                <div className="adm-meta-row">
                  {format && (
                    <span className="adm-meta-tag">
                      {FORMAT_ICONS[format] || <Tv size={14} />} {format}
                    </span>
                  )}
                  {episodes && <span className="adm-meta-tag">{episodes} episodes</span>}
                  {airingStatus && (
                    <span className="adm-meta-tag status flex items-center gap-1">
                      {airingStatus === 'RELEASING' && <span className="animate-pulse" style={{ color: 'var(--success)' }}>●</span>}
                      {airingStatus}
                    </span>
                  )}
                  {season && year && <span className="adm-meta-tag">{season} {year}</span>}
                  {studio && <span className="adm-meta-tag">{studio}</span>}
                </div>
                {genres.length > 0 && (
                  <div className="adm-genres">
                    {genres.map((g: string) => (
                      <span key={g} className="adm-genre-tag">{g}</span>
                    ))}
                  </div>
                )}

                {/* List actions */}
                <div className="adm-actions">
                  {listEntry ? (
                    <>
                      <div className="adm-status-pill" style={{
                        borderColor: STATUS_OPTIONS.find(s => s.key === (listEntry.status || editStatus))?.color
                      }}>
                        {STATUS_OPTIONS.find(s => s.key === (listEntry.status || editStatus))?.icon}
                        <span>{STATUS_OPTIONS.find(s => s.key === (listEntry.status || editStatus))?.label}</span>
                        {listEntry.rating > 0 && (
                          <span className="adm-inline-rating">
                            <Star size={11} fill="var(--warning)" color="var(--warning)" /> {listEntry.rating}
                          </span>
                        )}
                      </div>
                      <button className="btn btn-sm btn-secondary" onClick={() => { populateEditFields(listEntry); setIsEditing(true); }}>
                        <Edit3 size={14} /> Edit
                      </button>
                    </>
                  ) : (
                    <div className="adm-add-group">
                      <button className="btn btn-gradient btn-sm" onClick={() => handleAddToList('planning')}>
                        <Plus size={14} /> Add to List
                      </button>
                      <div className="adm-quick-add">
                        {STATUS_OPTIONS.map(s => (
                          <button key={s.key} className="adm-quick-btn" onClick={() => handleAddToList(s.key)}
                            title={s.label} style={{ color: s.color }}>
                            {s.icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Synopsis */}
            {synopsis && (
              <div className="adm-section">
                <h3>Synopsis</h3>
                <p className="adm-synopsis" dangerouslySetInnerHTML={{
                  __html: (synopsisExpanded ? synopsis : synopsis.slice(0, 300) + (synopsis.length > 300 ? '...' : '')).replace(/<br\s*\/?>/g, ' ').replace(/<\/?[^>]+(>|$)/g, '')
                }} />
                {synopsis.length > 300 && (
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => setSynopsisExpanded(!synopsisExpanded)}>
                    {synopsisExpanded ? 'Show Less' : 'Read More'}
                  </button>
                )}
              </div>
            )}

            {/* YouTube Trailer Feature */}
            {trailerData && (
              <div className="adm-section animate-fade-in">
                <h3><Film size={16} /> Official Trailer</h3>
                <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 8, marginTop: 12 }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${trailerData}`}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                    allowFullScreen
                    title="Anime Trailer"
                  />
                </div>
              </div>
            )}

            {/* User notes - shown if entry has notes */}
            {listEntry?.notes && !isEditing && (
              <div className="adm-section">
                <h3><MessageSquare size={16} /> Your Notes</h3>
                <p className="adm-user-notes">{listEntry.notes}</p>
              </div>
            )}

            {/* Edit Panel */}
            {isEditing && (
              <div className="adm-edit-panel">
                <h3><Edit3 size={16} /> Edit Entry</h3>
                <div className="adm-edit-grid">
                  <div className="adm-edit-field">
                    <label>Status</label>
                    <select className="input" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="adm-edit-field">
                    <label>Episodes Watched</label>
                    <input className="input" type="number" min={0} max={episodes || 9999}
                      value={editEpisodes} onChange={e => setEditEpisodes(Number(e.target.value))} />
                  </div>
                  <div className="adm-edit-field">
                    <label>Rating ({editRating}/10)</label>
                    <div className="adm-rating-row">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <Star
                          key={n} size={20}
                          className={`rating-star ${n <= editRating ? 'active' : ''}`}
                          fill={n <= editRating ? 'var(--warning)' : 'none'}
                          color={n <= editRating ? 'var(--warning)' : 'var(--text-tertiary)'}
                          onClick={() => setEditRating(n === editRating ? 0 : n)}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="adm-edit-field full">
                    <label>
                      Notes
                      <span style={{ float: 'right', fontSize: '0.75em', color: editNotes.length > 1000 ? 'var(--error)' : 'var(--text-tertiary)' }}>
                        {editNotes.length}/1000
                      </span>
                    </label>
                    <textarea className="input" value={editNotes} onChange={e => setEditNotes(e.target.value.substring(0, 1000))}
                      placeholder="Your thoughts, favorite moments, etc." rows={Math.max(3, editNotes.split('\n').length)} style={{ resize: 'vertical' }} />
                  </div>
                  <div className="adm-edit-field">
                    <label><Calendar size={14} /> Start Date</label>
                    <input className="input" type="date" value={editStartDate}
                      onChange={e => setEditStartDate(e.target.value)} />
                  </div>
                  <div className="adm-edit-field">
                    <label><Calendar size={14} /> End Date</label>
                    <input className="input" type="date" value={editEndDate}
                      onChange={e => setEditEndDate(e.target.value)} />
                  </div>
                  <div className="adm-edit-field full">
                    <label><Tag size={14} /> Tags (comma-separated)</label>
                    <input className="input" type="text" value={editTags}
                      onChange={e => setEditTags(e.target.value)}
                      placeholder="e.g.: masterpiece, rewatch, favorite arc" />
                  </div>
                </div>
                <div className="adm-edit-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(false)}>Cancel</button>
                  <button className="btn btn-error btn-sm" onClick={handleRemove}>Remove from List</button>
                  <button className="btn btn-gradient btn-sm" onClick={handleSaveEdit} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}

            {/* Relations (Sequels, Prequels, etc.) — NOW CLICKABLE INTERNALLY */}
            {relations.length > 0 && (
              <div className="adm-section">
                <h3>📺 Related Anime</h3>
                <div className="adm-relations">
                  {relations.map((rel: any, i: number) => (
                    <div key={i} className="adm-relation-item"
                      onClick={() => {
                        if (rel.id) {
                          navigateToAnime(rel.id);
                        }
                      }}>
                      <SmartImage
                        className="adm-rel-img"
                        src={rel.coverImage}
                        alt={rel.title}
                        malId={rel.malId}
                        anilistId={rel.id}
                      />
                      <div className="adm-rel-info">
                        <span className="adm-rel-type">{rel.relationType || rel.type}</span>
                        <span className="adm-rel-title">{rel.title}</span>
                      </div>
                      <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* External links — use correct IDs */}
            <div className="adm-section adm-links-row">
              <a href={`https://anilist.co/anime/${a.anilist_id || a.anilistId || currentAnimeId}`} target="_blank" rel="noopener"
                className="adm-ext-link">
                <ExternalLink size={14} /> AniList
              </a>
              {(a.mal_id || a.malId) && (
                <a href={`https://myanimelist.net/anime/${a.mal_id || a.malId}`} target="_blank" rel="noopener"
                  className="adm-ext-link">
                  <ExternalLink size={14} /> MAL
                </a>
              )}
              {season && year && (
                <a href={`https://anichart.net/${season.toLowerCase()}-${year}`} target="_blank" rel="noopener"
                  className="adm-ext-link">
                  <ExternalLink size={14} /> AniChart
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .anime-detail-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(6px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: adm-fade-in 0.2s ease;
        }
        @keyframes adm-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .anime-detail-modal {
          width: 100%;
          max-width: 720px;
          max-height: 90vh;
          overflow-y: auto;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          position: relative;
          animation: adm-slide-up 0.3s ease;
        }
        @keyframes adm-slide-up {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .anime-detail-modal::-webkit-scrollbar { width: 6px; }
        .anime-detail-modal::-webkit-scrollbar-track { background: transparent; }
        .anime-detail-modal::-webkit-scrollbar-thumb {
          background: rgba(124,92,252,0.3);
          border-radius: 3px;
        }
        .adm-back {
          position: absolute;
          top: 12px;
          left: 12px;
          padding: 6px 14px;
          border-radius: 20px;
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.15);
          color: white;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          z-index: 10;
          backdrop-filter: blur(8px);
          transition: all 0.2s;
        }
        .adm-back:hover { background: rgba(124,92,252,0.6); }
        .adm-banner {
          position: relative;
          height: 180px;
          overflow: hidden;
          border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        }
        .adm-banner img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .adm-banner-fade {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 80px;
          background: linear-gradient(transparent, var(--bg-secondary));
        }
        .adm-close {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 36px;
          height: 36px;
          border-radius: var(--radius-full);
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.15);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          backdrop-filter: blur(8px);
          transition: all 0.2s;
        }
        .adm-close:hover { background: rgba(239,68,68,0.8); }
        .adm-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 80px 20px;
          color: var(--text-secondary);
        }
        .adm-content {
          padding: 24px;
        }
        .adm-header {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
        }
        .adm-cover-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .adm-cover {
          width: 140px;
          height: 200px;
          object-fit: cover;
          border-radius: var(--radius-lg);
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .adm-cover-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 3rem;
          background: linear-gradient(135deg, #1a1a3e, #2d1b69);
        }
        .adm-score-badge {
          position: absolute;
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--bg-primary);
          border: 2px solid var(--warning);
          border-radius: 20px;
          padding: 3px 10px;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--warning);
          white-space: nowrap;
        }
        .adm-info {
          flex: 1;
          min-width: 0;
        }
        .adm-title {
          font-family: var(--font-display);
          font-size: 1.4rem;
          font-weight: 800;
          margin-bottom: 4px;
          line-height: 1.2;
        }
        .adm-romaji {
          font-size: 0.85rem;
          color: var(--text-tertiary);
          margin-bottom: 10px;
        }
        .adm-meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 10px;
        }
        .adm-meta-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          padding: 2px 8px;
          background: var(--bg-tertiary);
          border-radius: 6px;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .adm-meta-tag.status {
          text-transform: capitalize;
        }
        .adm-genres {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-bottom: 12px;
        }
        .adm-genre-tag {
          font-size: 0.72rem;
          padding: 2px 8px;
          background: rgba(124, 92, 252, 0.12);
          color: var(--accent-primary);
          border-radius: 12px;
          font-weight: 600;
        }
        .adm-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .adm-status-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: 1px solid var(--border-color);
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          background: var(--bg-tertiary);
        }
        .adm-inline-rating {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          margin-left: 6px;
          padding-left: 6px;
          border-left: 1px solid var(--border-color);
          color: var(--warning);
          font-weight: 700;
        }
        .adm-add-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .adm-quick-add {
          display: flex;
          gap: 4px;
        }
        .adm-quick-btn {
          width: 28px;
          height: 28px;
          border-radius: var(--radius-full);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
        }
        .adm-quick-btn:hover {
          transform: scale(1.15);
          border-color: currentColor;
          background: rgba(124,92,252,0.1);
        }
        .adm-section {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
        }
        .adm-section h3 {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-display);
          font-size: 0.95rem;
          font-weight: 700;
          margin-bottom: 10px;
        }
        .adm-synopsis {
          font-size: 0.88rem;
          color: var(--text-secondary);
          line-height: 1.65;
          max-height: 180px;
          overflow-y: auto;
        }
        .adm-user-notes {
          font-size: 0.88rem;
          color: var(--text-secondary);
          font-style: italic;
          background: var(--bg-tertiary);
          padding: 12px;
          border-radius: var(--radius-md);
          border-left: 3px solid var(--accent-primary);
        }
        .adm-edit-panel {
          margin-top: 20px;
          padding: 20px;
          background: var(--bg-primary);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-color);
        }
        .adm-edit-panel h3 {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-display);
          font-size: 1rem;
          margin-bottom: 16px;
        }
        .adm-edit-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .adm-edit-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .adm-edit-field.full {
          grid-column: 1 / -1;
        }
        .adm-edit-field label {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .adm-rating-row {
          display: flex;
          gap: 2px;
          flex-wrap: wrap;
        }
        .adm-edit-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
        }
        .btn-error {
          background: rgba(239,68,68,0.15);
          color: var(--error);
          border: 1px solid rgba(239,68,68,0.3);
        }
        .btn-error:hover {
          background: rgba(239,68,68,0.3);
        }
        .adm-relations {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .adm-relation-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.15s;
        }
        .adm-relation-item:hover {
          border-color: var(--accent-primary);
          background: rgba(124,92,252,0.05);
        }
        .adm-rel-img {
          width: 36px;
          height: 50px;
          object-fit: cover;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .adm-rel-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .adm-rel-type {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--accent-primary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .adm-rel-title {
          font-size: 0.85rem;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .adm-links-row {
          display: flex;
          gap: 12px;
        }
        .adm-ext-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          font-weight: 500;
          color: var(--text-secondary);
          padding: 6px 14px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          text-decoration: none;
          transition: all 0.15s;
        }
        .adm-ext-link:hover {
          color: var(--accent-primary);
          border-color: var(--accent-primary);
        }
        @media (max-width: 768px) {
          .anime-detail-overlay {
            padding: 0;
            align-items: flex-end;
          }
          .anime-detail-modal {
            max-height: 95vh;
            max-width: 100%;
            border-radius: var(--radius-xl) var(--radius-xl) 0 0;
            animation: adm-slide-up-mobile 0.3s ease;
          }
          @keyframes adm-slide-up-mobile {
            from { opacity: 0; transform: translateY(100%); }
            to { opacity: 1; transform: translateY(0); }
          }
          .adm-header {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
          .adm-cover { width: 110px; height: 160px; }
          .adm-title { font-size: 1.15rem; }
          .adm-romaji { font-size: 0.78rem; }
          .adm-actions { justify-content: center; }
          .adm-content { padding: 16px; }
          .adm-edit-grid { grid-template-columns: 1fr; }
          .adm-banner { height: 120px; }
          .adm-genres { justify-content: center; }
          .adm-meta-row { justify-content: center; }
          .adm-synopsis { font-size: 0.82rem; max-height: 150px; }
          .adm-close { width: 40px; height: 40px; }
          .adm-quick-btn { width: 34px; height: 34px; }
          .adm-links-row { flex-wrap: wrap; gap: 6px; }
          .adm-ext-link { font-size: 0.75rem; padding: 6px 10px; }
          .adm-edit-actions { flex-wrap: wrap; justify-content: center; }
          .adm-relation-item { padding: 6px 8px; gap: 8px; }
          .adm-rel-img { width: 30px; height: 42px; }
          .adm-rel-title { font-size: 0.78rem; }
          .modal-nav { display: none; }
          .adm-user-notes { font-size: 0.82rem; padding: 10px; }
        }
        @media (max-width: 480px) {
          .adm-cover { width: 90px; height: 130px; }
          .adm-title { font-size: 1rem; }
          .adm-back { font-size: 0.72rem; padding: 4px 10px; }
          .adm-genre-tag { font-size: 0.65rem; padding: 1px 6px; }
          .adm-meta-tag { font-size: 0.68rem; }
        }
      `}</style>
    </div>
  );
}
