import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Star, Trash2, Edit3, Heart, BookOpen, Eye, CheckCircle, Clock, X, Upload, FileText, Download, Search, SortDesc, LayoutGrid, LayoutList, Plus, Dices, ArrowUp, User } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import AnimeDetailModal from '../components/AnimeDetailModal';
import SmartImage from '../components/SmartImage';
import malExportImg from '../assets/import/mal-export.png';
import anilistExportImg from '../assets/import/anilist-export.png';

interface ListItem {
    id: string;
    animeId: number;
    anilistId?: number;
    malId?: number;
    title: string;
    titleRomaji?: string;
    coverImage: string;
    synopsis?: string;
    genres: string[];
    tags: string[];
    episodes?: number;
    animeStatus?: string;
    averageScore?: number;
    format?: string;
    status: string;
    rating: number | null;
    notes: string | null;
    favorite: boolean;
    episodesWatched: number;
}

const STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    watching: { label: 'Watching', icon: <Eye size={14} />, color: '#3b82f6' },
    rewatching: { label: 'Rewatching', icon: <CheckCircle size={14} fill="currentColor" color="#fff" style={{ opacity: 0.8 }} />, color: '#8b5cf6' },
    completed: { label: 'Completed', icon: <CheckCircle size={14} />, color: '#22c55e' },
    planning: { label: 'Plan to Watch', icon: <Clock size={14} />, color: '#f59e0b' },
    paused: { label: 'Paused', icon: <BookOpen size={14} />, color: '#8b8b8b' },
    dropped: { label: 'Dropped', icon: <X size={14} />, color: '#ef4444' },
};

const SORT_OPTIONS = [
    { key: 'title', label: 'Title' },
    { key: 'rating', label: 'Your Rating' },
    { key: 'score', label: 'Score' },
    { key: 'recent', label: 'Recently Added' },
];

const ITEM_HEIGHT = 157;
const GRID_ROW_HEIGHT = 280;
const OVERSCAN = 5;

// SafeImage removed — using SmartImage from components for multi-source fallback

export default function MyListPage() {
    const [list, setList] = useState<ListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('recent');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
        try {
            const saved = localStorage.getItem('anirec_view_mode');
            return (saved === 'grid' || saved === 'list') ? saved : 'list';
        } catch { return 'list'; }
    });
    const [editItem, setEditItem] = useState<ListItem | null>(null);
    const [editRating, setEditRating] = useState(0);
    const [editNotes, setEditNotes] = useState('');
    const [editStatus, setEditStatus] = useState('planning');

    // Anime detail modal
    const [detailAnimeId, setDetailAnimeId] = useState<number | null>(null);
    const [detailInitialData, setDetailInitialData] = useState<any>(null);

    // Import state
    const [showImport, setShowImport] = useState(false);
    const [importMode, setImportMode] = useState<'file' | 'text' | 'anilist'>('file');
    const [importText, setImportText] = useState('');
    const [anilistUsername, setAnilistUsername] = useState('');
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importPhase, setImportPhase] = useState<'uploading' | 'processing' | 'done' | null>(null);
    const [importResult, setImportResult] = useState<any>(null);
    const [importEta, setImportEta] = useState<number | null>(null);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [importStage, setImportStage] = useState<string>('');
    const [currentAnime, setCurrentAnime] = useState<string>('');
    const [resolvedAniList, setResolvedAniList] = useState(0);
    const [resolvedJikan, setResolvedJikan] = useState(0);
    const [skippedAlreadyInList, setSkippedAlreadyInList] = useState(0);
    const [failedNotFound, setFailedNotFound] = useState(0);
    const [failedError, setFailedError] = useState(0);
    const [jobWarnings, setJobWarnings] = useState<string[]>([]);
    const [jobErrors, setJobErrors] = useState<string[]>([]);
    const cancelPollRef = useRef<(() => void) | null>(null);
    const [importFilter, setImportFilter] = useState<'all' | 'failed' | 'resolution'>('all');
    const [importLimit, setImportLimit] = useState(30);
    const [sheepCount, setSheepCount] = useState(0);
    const [funFactIdx, setFunFactIdx] = useState(0);
    // Manual search for "Not Found" items
    const [searchingForItem, setSearchingForItem] = useState<number | null>(null);
    const [manualSearchQuery, setManualSearchQuery] = useState('');
    const [manualSearchResults, setManualSearchResults] = useState<any[]>([]);
    const [manualSearchLoading, setManualSearchLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [showScrollTop, setShowScrollTop] = useState(false);

    // Feature: Bulk Selection
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Feature: Gallery Navigation
    const [currentIndexNav, setCurrentIndexNav] = useState(-1);

    // Virtual scroll state
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(800);
    const [containerWidth, setContainerWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

    // Track container width for responsive grid columns
    useEffect(() => {
        const updateWidth = () => {
            const el = scrollContainerRef.current;
            if (el) {
                setContainerWidth(el.clientWidth);
                setContainerHeight(el.clientHeight);
            } else {
                setContainerWidth(window.innerWidth);
            }
        };
        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    useEffect(() => {
        loadList();

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
            // PC Feature: Ctrl+G to switch to grid, Ctrl+L to switch to list
            if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
                e.preventDefault();
                setViewMode('grid');
                localStorage.setItem('anirec_view_mode', 'grid');
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
                e.preventDefault();
                setViewMode('list');
                localStorage.setItem('anirec_view_mode', 'list');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Resize observer for virtual scrolling container
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerHeight(entry.contentRect.height);
            }
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // Sheep counting animation + fun fact rotation during import
    useEffect(() => {
        if (!importing) {
            setSheepCount(0);
            setFunFactIdx(0);
            return;
        }
        // Sheep jumps every 1.6s (matches CSS animation)
        const sheepTimer = setInterval(() => setSheepCount(c => c + 1), 1600);
        // Rotate fun facts every 8s
        const factTimer = setInterval(() => setFunFactIdx(i => i + 1), 8000);
        return () => {
            clearInterval(sheepTimer);
            clearInterval(factTimer);
        };
    }, [importing]);

    const loadList = async () => {
        try {
            const { list: data } = await api.getMyList();
            setList(data);
            setLastUpdated(new Date());
        } catch (err: any) {
            toast.error('Failed to load list');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!confirm('Remove this anime from your list?')) return;
        try {
            await api.removeFromList(id);
            setList(prev => prev.filter(item => item.id !== id));
            toast.success('Removed from list');
        } catch (err: any) {
            toast.error('Failed to remove');
        }
    };

    const openEdit = (item: ListItem, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setEditItem(item);
        setEditRating(item.rating || 0);
        setEditNotes(item.notes || '');
        setEditStatus(item.status);
    };

    const saveEdit = async () => {
        if (!editItem) return;
        try {
            await api.updateListItem(editItem.id, {
                rating: editRating || undefined,
                notes: editNotes || undefined,
                status: editStatus,
            });
            setList(prev =>
                prev.map(item =>
                    item.id === editItem.id
                        ? { ...item, rating: editRating, notes: editNotes, status: editStatus }
                        : item
                )
            );
            setEditItem(null);
            toast.success('Updated!');
        } catch (err: any) {
            toast.error('Failed to update');
        }
    };

    const handleBulkAction = async (action: 'completed' | 'dropped' | 'delete') => {
        if (selectedIds.size === 0) return;
        if (action === 'delete' && !confirm(`Delete ${selectedIds.size} items?`)) return;

        try {
            const promises = Array.from(selectedIds).map(id => {
                if (action === 'delete') return api.removeFromList(id);
                return api.updateListItem(id, { status: action });
            });
            await Promise.all(promises);

            setList(prev => prev.filter(i => {
                if (!selectedIds.has(i.id)) return true;
                if (action === 'delete') return false;
                i.status = action;
                return true;
            }));

            setSelectedIds(new Set());
            setSelectionMode(false);
            toast.success(`Successfully applied action to ${promises.length} items`);
        } catch (err) {
            toast.error('Bulk action failed on some items');
        }
    };

    const pickRandom = () => {
        const pool = list.filter(item => item.status === 'planning' || item.status === 'watching');
        if (pool.length === 0) {
            toast.error("Add some anime to 'Plan to Watch' or 'Watching' first!");
            return;
        }
        const randomItem = pool[Math.floor(Math.random() * pool.length)];
        openAnimeDetail(randomItem);
        toast.success(`🎲 Random pick: ${randomItem.title}!`);
    };

    const toggleFavorite = async (item: ListItem, e?: React.MouseEvent) => {
        e?.stopPropagation();
        try {
            await api.updateListItem(item.id, { favorite: !item.favorite });
            setList(prev =>
                prev.map(i => i.id === item.id ? { ...i, favorite: !i.favorite } : i)
            );
        } catch (err: any) {
            toast.error('Failed to update favorite');
        }
    };

    const incrementEpisode = async (item: ListItem, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const eps = item.episodesWatched || 0;
        if (item.episodes && eps >= item.episodes) return;

        try {
            await api.updateListItem(item.id, { episodesWatched: eps + 1 });
            setList(prev =>
                prev.map(i => i.id === item.id ? { ...i, episodesWatched: eps + 1 } : i)
            );
            toast.success(`Watched episode ${eps + 1}!`);
        } catch (err: any) {
            toast.error('Failed to update episode count');
        }
    };

    const openAnimeDetail = (item: ListItem) => {
        setDetailInitialData({
            title: item.title,
            titleRomaji: item.titleRomaji,
            coverImage: item.coverImage,
            genres: item.genres,
            episodes: item.episodes,
            averageScore: item.averageScore,
            format: item.format,
            status: item.animeStatus,
        });
        setDetailAnimeId(item.animeId);
        setCurrentIndexNav(filtered.findIndex(i => i.id === item.id));
    };

    const navigateDetail = (direction: 'next' | 'prev') => {
        if (currentIndexNav === -1) return;
        let nextIndex = direction === 'next' ? currentIndexNav + 1 : currentIndexNav - 1;
        if (nextIndex >= 0 && nextIndex < filtered.length) {
            const nextItem = filtered[nextIndex];
            setDetailAnimeId(nextItem.animeId);
            setDetailInitialData(nextItem);
            setCurrentIndexNav(nextIndex);
        }
    };

    // Import handlers
    const startPollingJob = (jobId: string) => {
        setActiveJobId(jobId);
        let backoffDelay = 500;
        let pollTimer: any = null;
        let isClosed = false;

        const poll = async () => {
            if (isClosed) return;
            try {
                const status = await api.getImportStatus(jobId);
                
                // Reset backoff delay on successful request
                backoffDelay = 500;

                setImportProgress(status.overallProgress);
                setImportStage(status.stage || '');
                setCurrentAnime(status.currentAnime || '');
                setResolvedAniList(status.resolvedAniList || 0);
                setResolvedJikan(status.resolvedJikan || 0);
                setSkippedAlreadyInList(status.skippedAlreadyInList || 0);
                setFailedNotFound(status.failedNotFound || 0);
                setFailedError(status.failedError || 0);
                setImportEta(status.etaSeconds);
                setJobWarnings(status.warnings || []);
                setJobErrors(status.errors || []);

                if (status.status === 'completed') {
                    setImportPhase('done');
                    setImportProgress(100);
                    setImportEta(null);
                    
                    const resultsList = status.results || [];
                    setImportResult({
                        imported: status.resolvedAniList + status.resolvedJikan,
                        skipped: status.skippedAlreadyInList,
                        failed: status.failedNotFound + status.failedError,
                        results: resultsList
                    });

                    toast.success('Import complete!');
                    setImporting(false);
                    loadList();
                    return;
                }

                if (status.status === 'failed' || status.status === 'cancelled' || status.status === 'abandoned') {
                    setImportPhase(null);
                    setImporting(false);
                    setImportEta(null);
                    
                    let errorMsg = status.errors?.[status.errors.length - 1] || 'Import failed';
                    if (status.status === 'cancelled') {
                        errorMsg = 'Import cancelled by user';
                    } else if (status.status === 'abandoned') {
                        errorMsg = 'Import abandoned: server restarted';
                    }
                    toast.error(errorMsg);
                    return;
                }

                pollTimer = setTimeout(poll, backoffDelay);
            } catch (err: any) {
                console.error('Polling error, backing off:', err);
                backoffDelay = Math.min(8000, backoffDelay * 2);
                pollTimer = setTimeout(poll, backoffDelay);
            }
        };

        pollTimer = setTimeout(poll, backoffDelay);

        return () => {
            isClosed = true;
            if (pollTimer) clearTimeout(pollTimer);
        };
    };

    const handleCancelImport = async () => {
        if (!activeJobId) return;
        try {
            await api.cancelImport(activeJobId);
            toast('Cancelling import...');
            if (cancelPollRef.current) cancelPollRef.current();
            setImporting(false);
            setImportPhase(null);
            setImportEta(null);
        } catch (err: any) {
            toast.error(err.message || 'Failed to cancel import');
        }
    };

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (cancelPollRef.current) cancelPollRef.current();
        };
    }, []);

    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setImportResult(null);
        setImportLimit(30);
        setImportPhase('uploading');
        setImportProgress(0);
        setImportEta(null);
        setJobWarnings([]);
        setJobErrors([]);

        try {
            const uploadRes = await api.importFile(file, (progress) => {
                setImportProgress(progress);
                if (progress >= 100) {
                    setImportPhase('processing');
                }
            });

            // Start polling
            const cleanupPoll = startPollingJob(uploadRes.jobId);
            cancelPollRef.current = cleanupPoll;

        } catch (err: any) {
            toast.error(err.message || 'Import failed');
            setImportPhase(null);
            setImportEta(null);
            setImporting(false);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleTextImport = async () => {
        // Strip leading numbers/bullet points (e.g., "126 Unlimited Gacha" -> "Unlimited Gacha")
        const names = importText
            .split('\n')
            .map(n => n.replace(/^\s*\d+[\s.)-]+\s*/, '').trim())
            .filter(Boolean);

        if (names.length === 0) {
            toast.error('Please enter some anime names');
            return;
        }

        setImporting(true);
        setImportResult(null);
        setImportLimit(30);
        setImportPhase('processing');
        setImportProgress(0);
        setImportEta(names.length * 1.5); // Estimate 1.5s per item due to 429 buffers

        try {
            // Process in chunks of 5 names to give faster UI updates and prevent dropping requests
            const CHUNK_SIZE = 5;
            let imported = 0;
            let failed = 0;
            let skipped = 0;
            let allResults: any[] = [];

            for (let i = 0; i < names.length; i += CHUNK_SIZE) {
                const chunk = names.slice(i, i + CHUNK_SIZE);
                const result = await api.importTextList(chunk);

                imported += result.imported || 0;
                failed += result.failed || 0;
                skipped += result.skipped || 0;
                allResults = [...allResults, ...(result.results || [])];

                const currentCount = i + chunk.length;
                const remaining = names.length - currentCount;
                setImportProgress(Math.min(99, Math.round((currentCount / names.length) * 100)));
                setImportEta(Math.max(0, remaining * 1.5));
            }

            setImportProgress(100);
            setImportPhase('done');
            setImportEta(null);

            const finalResult = {
                imported, failed, skipped, total: names.length, results: allResults
            };

            setImportResult(finalResult);
            toast.success(`Imported ${imported} anime!`);
            if (imported > 0) loadList();
        } catch (err: any) {
            toast.error(err.message || 'Import failed');
            setImportPhase(null);
            setImportEta(null);
        } finally {
            setImporting(false);
            setImportEta(null);
        }
    };

    const handleAniListImport = async () => {
        const username = anilistUsername.trim();
        if (!username) {
            toast.error('Please enter an AniList username');
            return;
        }

        setImporting(true);
        setImportResult(null);
        setImportLimit(30);
        setImportPhase('processing');
        setImportProgress(0);
        setImportEta(null);
        setJobWarnings([]);
        setJobErrors([]);

        try {
            // First fetch the profile & start the job
            const startRes = await api.importAniListByUsername(username);

            // Start polling
            const cleanupPoll = startPollingJob(startRes.jobId);
            cancelPollRef.current = cleanupPoll;

        } catch (err: any) {
            toast.error(err.message || 'Failed to import from AniList');
            setImportPhase(null);
            setImportEta(null);
            setImporting(false);
        }
    };

    const handleExport = async (format: 'json' | 'csv' | 'markdown') => {
        let content = '';
        let mime = 'text/plain';
        let filename = `anime_list_export.${format}`;

        if (format === 'json') {
            content = JSON.stringify(list, null, 2);
            mime = 'application/json';
        } else if (format === 'csv') {
            content = ['Title,Status,EpisodesWatched,Rating,Notes'].concat(
                list.map(i => `"${(i.title || '').replace(/"/g, '""')}","${i.status}",${i.episodesWatched || 0},${i.rating || 0},"${(i.notes || '').replace(/"/g, '""')}"`)
            ).join('\n');
            mime = 'text/csv';
        } else if (format === 'markdown') {
            content = '# My Anime List\n\n' + list.map(i => `- **${i.title}** (${i.status}) - ${i.rating || 'No'} Rating, ${i.episodesWatched || 0}/${i.episodes || '?'} Episodes.\n  *${i.notes || ''}*`).join('\n\n');
            filename = 'anime_list_export.md';
        }

        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported as ${format.toUpperCase()}`);
    };

    // Filter, search, and sort
    const filtered = useMemo(() => {
        let result = list
            .filter(item => {
                if (filter === 'all') return true;
                if (filter === 'favorites') return item.favorite;
                return item.status === filter;
            })
            .filter(item =>
                !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (item.titleRomaji && item.titleRomaji.toLowerCase().includes(searchQuery.toLowerCase()))
            );

        // Sort
        switch (sortBy) {
            case 'title':
                result = [...result].sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'rating':
                result = [...result].sort((a, b) => (b.rating || 0) - (a.rating || 0));
                break;
            case 'score':
                result = [...result].sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));
                break;
            case 'recent':
            default:
                // Keep original order (most recent first)
                break;
        }

        return result;
    }, [list, filter, searchQuery, sortBy]);

    const statusCounts = useMemo(() => {
        return list.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [list]);

    // Virtual scroll calculations
    const itemHeight = viewMode === 'list' ? ITEM_HEIGHT : GRID_ROW_HEIGHT;
    const gridColumns = viewMode === 'grid' ? Math.max(1, Math.min(6, Math.floor((containerWidth > 0 ? containerWidth : 800) / 180))) : 1;
    const rowCount = viewMode === 'grid' ? Math.ceil(filtered.length / gridColumns) : filtered.length;

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - OVERSCAN);
    const endIndex = Math.min(rowCount, Math.ceil((scrollTop + containerHeight) / itemHeight) + OVERSCAN);

    const visibleItems = useMemo(() => {
        if (viewMode === 'grid') {
            const items: ListItem[][] = [];
            for (let row = startIndex; row < endIndex; row++) {
                const rowItems: ListItem[] = [];
                for (let col = 0; col < gridColumns; col++) {
                    const index = row * gridColumns + col;
                    if (index < filtered.length) {
                        rowItems.push(filtered[index]);
                    }
                }
                items.push(rowItems);
            }
            return items;
        }
        return filtered.slice(startIndex, endIndex);
    }, [filtered, startIndex, endIndex, viewMode, gridColumns]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
        setShowScrollTop(e.currentTarget.scrollTop > 400);
    }, []);

    const handleScrollTopClick = () => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner" />
                <span className="loading-text">Loading your list...</span>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="page-header animate-slide-up">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h1 className="page-title">My Anime List</h1>
                        <p className="page-subtitle">{list.length} anime in your collection</p>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn btn-gradient btn-sm" onClick={() => setShowImport(true)}>
                            <Upload size={14} /> Import
                        </button>
                        <div className="dropdown-wrapper">
                            <button className="btn btn-secondary btn-sm">
                                <Download size={14} /> Export
                            </button>
                            <div className="dropdown-menu">
                                <button onClick={() => handleExport('json')}>📄 JSON</button>
                                <button onClick={() => handleExport('csv')}>📊 CSV</button>
                                <button onClick={() => handleExport('markdown')}>📝 Markdown</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Search + sort + view controls */}
            <div className="list-controls mb-3 animate-fade-in">
                <div className="search-bar-small" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px' }}>
                    <Search size={16} color="var(--text-tertiary)" />
                    <input
                        ref={searchInputRef}
                        className="input-base"
                        style={{ border: 'none', background: 'transparent', flex: 1, padding: '6px 0', outline: 'none', color: 'var(--text-primary)' }}
                        type="text"
                        placeholder="Search list (Cmd+K)..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <button className="btn btn-icon btn-ghost" title="Pick Random Anime" onClick={pickRandom} style={{ width: 30, height: 30, padding: 0 }}>
                        <Dices size={16} color="var(--accent-primary)" />
                    </button>
                </div>
                <div className="list-controls-right">
                    <div className="sort-dropdown">
                        <SortDesc size={14} />
                        <select className="input input-sm" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                            {SORT_OPTIONS.map(opt => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="view-toggle">
                        <button className={`view-btn ${selectionMode ? 'active border-primary text-primary' : ''}`} onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); }} title="Bulk Select">
                            <CheckCircle size={16} />
                        </button>
                        <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => { setViewMode('list'); localStorage.setItem('anirec_view_mode', 'list'); }} title="List View (Ctrl+L)">
                            <LayoutList size={16} />
                        </button>
                        <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => { setViewMode('grid'); localStorage.setItem('anirec_view_mode', 'grid'); }} title="Grid View (Ctrl+G)">
                            <LayoutGrid size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {selectionMode && selectedIds.size > 0 && (
                <div className="bulk-action-bar animate-fade-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '12px 20px', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                    <span>{selectedIds.size} Anime Selected</span>
                    <div className="flex gap-2">
                        <button className="btn btn-sm" style={{ background: STATUS_LABELS['completed'].color, color: 'white' }} onClick={() => handleBulkAction('completed')}>Mark Completed</button>
                        <button className="btn btn-sm btn-error" onClick={() => handleBulkAction('delete')}><Trash2 size={14} /> Remove All</button>
                    </div>
                </div>
            )}

            {/* Status filters */}
            <div className="tabs mb-4 animate-fade-in">
                <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                    All ({list.length})
                </button>
                {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                    <button
                        key={key}
                        className={`tab ${filter === key ? 'active' : ''}`}
                        onClick={() => setFilter(key)}
                    >
                        {label} ({statusCounts[key] || 0})
                    </button>
                ))}
                <button className={`tab ${filter === 'favorites' ? 'active' : ''}`} onClick={() => setFilter('favorites')}>
                    ❤️ Favorites ({list.filter(i => i.favorite).length})
                </button>
            </div>

            {/* Quick Stats Bar */}
            {list.length > 0 && (
                <div className="quick-stats-bar animate-fade-in">
                    <div className="quick-stat">
                        <span className="quick-stat-num">{list.filter(i => i.status === 'completed').length}</span>
                        <span className="quick-stat-label">Completed</span>
                    </div>
                    <div className="quick-stat-divider" />
                    <div className="quick-stat">
                        <span className="quick-stat-num">{list.filter(i => i.rating).length}</span>
                        <span className="quick-stat-label">Rated</span>
                    </div>
                    <div className="quick-stat-divider" />
                    <div className="quick-stat">
                        <span className="quick-stat-num">{list.reduce((a, i) => a + (i.episodesWatched || 0), 0)}</span>
                        <span className="quick-stat-label">Episodes</span>
                    </div>
                    <div className="quick-stat-divider" />
                    <div className="quick-stat">
                        <span className="quick-stat-num">
                            {list.filter(i => i.rating).length > 0
                                ? (list.filter(i => i.rating).reduce((a, i) => a + (i.rating || 0), 0) / list.filter(i => i.rating).length).toFixed(1)
                                : '—'}
                        </span>
                        <span className="quick-stat-label">Avg Rating</span>
                    </div>
                    <div className="quick-stat-divider" />
                    <div className="quick-stat">
                        <span className="quick-stat-num">{Math.round(list.reduce((a, i) => a + (i.episodesWatched || 0), 0) * 24 / 60)}h</span>
                        <span className="quick-stat-label">Watch Time</span>
                    </div>
                </div>
            )}

            {lastUpdated && (
                <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: -6, marginBottom: 16, marginRight: 8, fontFamily: 'var(--font-mono, monospace)' }}>
                    <span className="animate-pulse mr-1" style={{ color: 'var(--success)' }}>●</span>
                    Last synced: {lastUpdated.toLocaleTimeString()}
                </div>
            )}

            {filtered.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">
                        {list.length === 0 ? 'Your list is empty' : 'No matches found'}
                    </div>
                    <p>{list.length === 0 ? 'Search and add anime from the home page, or import your list!' : 'Try a different filter or search'}</p>
                    {list.length === 0 && (
                        <button className="btn btn-gradient mt-3" onClick={() => setShowImport(true)}>
                            <Upload size={16} /> Import Your List
                        </button>
                    )}
                </div>
            ) : (
                <div
                    ref={scrollContainerRef}
                    className="virtual-scroll-container animate-fade-in"
                    onScroll={handleScroll}
                >
                    <div style={{
                        paddingTop: startIndex * (viewMode === 'list' ? ITEM_HEIGHT : GRID_ROW_HEIGHT),
                        paddingBottom: Math.max(0, rowCount - endIndex) * (viewMode === 'list' ? ITEM_HEIGHT : GRID_ROW_HEIGHT),
                    }}>
                        {viewMode === 'list' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {(visibleItems as ListItem[]).map((item) => (
                                    <div
                                        key={item.id}
                                        className={`list-item card list-item-interactive ${selectedIds.has(item.id) ? 'selected-border' : ''}`}
                                        style={{
                                            minHeight: 145,
                                            border: selectedIds.has(item.id) ? '2px solid var(--accent-primary)' : undefined
                                        }}
                                        onClick={() => {
                                            if (selectionMode) {
                                                const newSet = new Set(selectedIds);
                                                if (newSet.has(item.id)) newSet.delete(item.id);
                                                else newSet.add(item.id);
                                                setSelectedIds(newSet);
                                            } else {
                                                openAnimeDetail(item);
                                            }
                                        }}
                                    >
                                        <SmartImage
                                            className="list-item-image"
                                            src={item.coverImage}
                                            alt={item.title}
                                            malId={item.malId}
                                            anilistId={item.anilistId}
                                        />
                                        <div className="list-item-content">
                                            <div className="list-item-header">
                                                <h3 className="list-item-title">{item.title}</h3>
                                                <div className="list-item-actions">
                                                    <button
                                                        className={`btn btn-icon btn-ghost ${item.favorite ? 'favorite-active' : ''}`}
                                                        onClick={(e) => toggleFavorite(item, e)}
                                                        title="Toggle favorite"
                                                    >
                                                        <Heart size={24} fill={item.favorite ? 'var(--accent-secondary)' : 'none'} />
                                                    </button>
                                                    <button className="btn btn-icon btn-ghost" onClick={(e) => openEdit(item, e)} title="Edit">
                                                        <Edit3 size={24} />
                                                    </button>
                                                    <button className="btn btn-icon btn-ghost" onClick={(e) => handleDelete(item.id, e)} title="Remove">
                                                        <Trash2 size={24} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="list-item-meta">
                                                <span className="list-status-badge" style={{ color: STATUS_LABELS[item.status]?.color }}>
                                                    {STATUS_LABELS[item.status]?.icon} {STATUS_LABELS[item.status]?.label}
                                                </span>
                                                {item.rating && (
                                                    <span className="list-item-rating">
                                                        <Star size={14} fill="var(--warning)" color="var(--warning)" /> {item.rating}/10
                                                    </span>
                                                )}
                                                {item.format && <span className="tag tag-sm">{item.format}</span>}
                                                {item.episodes && (
                                                    <span className="flex items-center gap-1">
                                                        {item.episodesWatched || 0}/{item.episodes} ep
                                                        {(item.episodesWatched || 0) < item.episodes && (
                                                            <button
                                                                className="btn btn-icon btn-ghost ep-increment-btn"
                                                                style={{ width: 40, height: 40, background: 'rgba(124,92,252,0.15)', borderRadius: '50%' }}
                                                                onClick={(e) => incrementEpisode(item, e)}
                                                                title="Watched +1 Episode"
                                                            >
                                                                <Plus size={28} />
                                                            </button>
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Watch Progress Bar */}
                                            {item.episodes && item.episodes > 0 && (
                                                <div className="progress-bar-wrap" title={`${item.episodesWatched || 0}/${item.episodes} episodes`}>
                                                    <div className="progress-bar-track">
                                                        <div className="progress-bar-fill" style={{
                                                            width: `${Math.min(100, ((item.episodesWatched || 0) / item.episodes) * 100)}%`,
                                                            background: (item.episodesWatched || 0) >= item.episodes
                                                                ? 'var(--success)'
                                                                : 'var(--accent-primary)',
                                                        }} />
                                                    </div>
                                                    <span className="progress-bar-label">
                                                        {Math.round(((item.episodesWatched || 0) / item.episodes) * 100)}%
                                                    </span>
                                                </div>
                                            )}
                                            {item.genres.length > 0 && (
                                                <div className="list-item-tags">
                                                    {item.genres.slice(0, 4).map(g => (
                                                        <span key={g} className="tag tag-sm">{g}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {item.notes && (
                                                <p className="list-item-notes">📝 {item.notes}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {(visibleItems as ListItem[][]).map((row, rowIdx) => (
                                    <div
                                        key={`row-${startIndex + rowIdx}`}
                                        className="grid-row"
                                        style={{
                                            /* Forcing exactly the amount of columns computed by virtual-scroll math to prevent trailing empty grid cells */
                                            gridTemplateColumns: `repeat(${gridColumns}, 1fr)`
                                        }}
                                    >
                                        {row.map(item => (
                                            <div key={item.id} className="grid-card card" onClick={() => {
                                                if (selectionMode) {
                                                    const newSet = new Set(selectedIds);
                                                    if (newSet.has(item.id)) newSet.delete(item.id);
                                                    else newSet.add(item.id);
                                                    setSelectedIds(newSet);
                                                } else {
                                                    openAnimeDetail(item);
                                                }
                                            }} style={{ border: selectedIds.has(item.id) ? '2px solid var(--accent-primary)' : undefined }}>
                                                <div className="grid-card-img-wrap">
                                                    <SmartImage
                                                        className="grid-card-image"
                                                        src={item.coverImage}
                                                        alt={item.title}
                                                        malId={item.malId}
                                                        anilistId={item.anilistId}
                                                    />
                                                    {/* Status badge on image */}
                                                    <div className="grid-status-badge" style={{ background: STATUS_LABELS[item.status]?.color }}>
                                                        {STATUS_LABELS[item.status]?.icon}
                                                    </div>
                                                    {item.favorite && (
                                                        <div className="grid-fav-badge">
                                                            <Heart size={12} fill="var(--accent-secondary)" color="var(--accent-secondary)" />
                                                        </div>
                                                    )}
                                                    {/* +1 ep button on grid card */}
                                                    {item.episodes && (item.episodesWatched || 0) < item.episodes && (
                                                        <button
                                                            className="grid-ep-btn"
                                                            onClick={e => incrementEpisode(item, e)}
                                                            title="+1 Episode"
                                                        >
                                                            <Plus size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="grid-card-body">
                                                    <h4 className="grid-card-title">{item.title}</h4>
                                                    <div className="grid-card-meta">
                                                        {item.rating && (
                                                            <span className="list-item-rating">
                                                                <Star size={11} fill="var(--warning)" color="var(--warning)" /> {item.rating}
                                                            </span>
                                                        )}
                                                        {item.episodes && (
                                                            <span className="grid-ep-count">
                                                                {item.episodesWatched || 0}/{item.episodes} ep
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Progress bar in grid */}
                                                    {item.episodes && item.episodes > 0 && (
                                                        <div className="grid-progress-wrap">
                                                            <div className="grid-progress-track">
                                                                <div className="grid-progress-fill" style={{
                                                                    width: `${Math.min(100, ((item.episodesWatched || 0) / item.episodes) * 100)}%`,
                                                                    background: (item.episodesWatched || 0) >= item.episodes ? 'var(--success)' : 'var(--accent-primary)',
                                                                }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Tags in grid */}
                                                    {item.genres.length > 0 && (
                                                        <div className="grid-card-tags">
                                                            {item.genres.slice(0, 2).map(g => (
                                                                <span key={g} className="tag tag-xs">{g}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showScrollTop && (
                <button
                    className="btn btn-primary animate-slide-up"
                    onClick={handleScrollTopClick}
                    style={{ position: 'fixed', bottom: 30, right: 30, borderRadius: '50%', width: 44, height: 44, padding: 0, zIndex: 50, boxShadow: '0 4px 16px rgba(124, 92, 252, 0.4)' }}
                    title="Back to Top"
                >
                    <ArrowUp size={20} />
                </button>
            )}

            {/* Anime Detail Modal */}
            {detailAnimeId && (
                <AnimeDetailModal
                    animeId={detailAnimeId}
                    initialData={detailInitialData}
                    onClose={() => { setDetailAnimeId(null); setDetailInitialData(null); setCurrentIndexNav(-1); }}
                    onListUpdated={loadList}
                    onNavigate={navigateDetail}
                    hasNext={currentIndexNav < filtered.length - 1 && currentIndexNav > -1}
                    hasPrev={currentIndexNav > 0}
                />
            )}

            {/* Edit Modal */}
            {editItem && (
                <div className="modal-overlay" onClick={() => setEditItem(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Edit: {editItem.title}</h3>
                            <button className="btn btn-icon btn-ghost" onClick={() => setEditItem(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body flex flex-col gap-4">
                            <div className="input-group">
                                <label>Status</label>
                                <select className="input" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                                    {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label>Rating ({editRating}/10)</label>
                                <div className="rating">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                        <Star
                                            key={n}
                                            size={24}
                                            className={`rating-star ${n <= editRating ? 'active' : ''}`}
                                            fill={n <= editRating ? 'var(--warning)' : 'none'}
                                            onClick={() => setEditRating(n === editRating ? 0 : n)}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="input-group">
                                <label>Notes</label>
                                <textarea
                                    className="input"
                                    value={editNotes}
                                    onChange={e => setEditNotes(e.target.value)}
                                    placeholder="What did you think? What parts stood out?"
                                    rows={4}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setEditItem(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveEdit}>Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImport && (
                <div className="modal-overlay" onClick={() => { if (!importing) { setShowImport(false); setImportResult(null); setImportPhase(null); } }}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">📥 Import Anime List</h3>
                            <button className="btn btn-icon btn-ghost" onClick={() => { if (!importing) { setShowImport(false); setImportResult(null); setImportPhase(null); } }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {/* Import Progress Overlay */}
                            {importing && (
                                <div className="import-progress-overlay">
                                    <div className="import-progress-content">
                                        {/* Sheep counting animation */}
                                        <div className="sheep-scene">
                                            <div className="sheep-fence" />
                                            <div className="sheep-jumping" key={sheepCount}>
                                                <span className="sheep-emoji">🐑</span>
                                            </div>
                                            <div className="sheep-counter">
                                                <span className="sheep-count-num">{sheepCount}</span>
                                                <span className="sheep-count-label">sheep counted</span>
                                            </div>
                                        </div>

                                        <div className="import-progress-bar-container">
                                            <div className="import-progress-bar-track">
                                                <div className="import-progress-bar-fill" style={{ width: `${importProgress}%` }} />
                                            </div>
                                            <span className="import-progress-pct">{importProgress}%</span>
                                        </div>

                                        <div className="import-progress-label">
                                            {importPhase === 'uploading' && '📤 Uploading your file...'}
                                            {importPhase === 'processing' && `⚙️ ${importStage || 'Processing...'}`}
                                            {importPhase === 'done' && '✅ Import complete!'}
                                        </div>
                                        <div className="import-progress-sublabel">
                                            {importPhase === 'uploading' && 'Transferring to server'}
                                            {importPhase === 'processing' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', alignItems: 'center' }}>
                                                    {currentAnime && (
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                                                            📖 {currentAnime}
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: 8, marginTop: 4 }}>
                                                        <div>✨ AniList: <strong>{resolvedAniList}</strong></div>
                                                        <div>🌐 Jikan: <strong>{resolvedJikan}</strong></div>
                                                        <div>⏩ Skipped: <strong>{skippedAlreadyInList}</strong></div>
                                                        <div>❌ Failed: <strong>{failedNotFound + failedError}</strong></div>
                                                    </div>
                                                </div>
                                            )}
                                            {importPhase === 'done' && 'Your list has been updated'}
                                        </div>
                                        {importEta !== null && importEta > 0 && (
                                            <div className="import-eta mt-2" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: 12 }}>
                                                ⏳ Estimated: ~{importEta >= 60 ? `${Math.floor(importEta / 60)}m ${Math.round(importEta % 60)}s` : `${Math.ceil(importEta)}s`}
                                            </div>
                                        )}
                                        {importPhase === 'processing' && activeJobId && (
                                            <button
                                                className="btn btn-sm btn-ghost mt-3 text-red-500 hover:bg-red-500/10"
                                                onClick={handleCancelImport}
                                                style={{ color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '4px 12px', borderRadius: 6, marginTop: 12 }}
                                            >
                                                Cancel Import
                                            </button>
                                        )}
                                        {jobWarnings.length > 0 && (
                                            <div style={{ maxHeight: '80px', overflowY: 'auto', textAlign: 'left', fontSize: '0.75rem', color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', padding: '6px 12px', borderRadius: 8, marginTop: 10, width: '100%' }}>
                                                ⚠️ Warnings:
                                                {jobWarnings.map((w, idx) => <div key={idx} style={{ marginTop: 2 }}>• {w}</div>)}
                                            </div>
                                        )}
                                        {jobErrors.length > 0 && (
                                            <div style={{ maxHeight: '80px', overflowY: 'auto', textAlign: 'left', fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', padding: '6px 12px', borderRadius: 8, marginTop: 10, width: '100%' }}>
                                                ❌ Errors:
                                                {jobErrors.map((e, idx) => <div key={idx} style={{ marginTop: 2 }}>• {e}</div>)}
                                            </div>
                                        )}
                                        {/* Rotating anime fun facts */}
                                        <div className="import-fun-fact">
                                            💡 {[
                                                'One Piece has over 1100 episodes!',
                                                'Studio Ghibli won an Oscar for Spirited Away',
                                                'Dragon Ball Z was originally a manga by Akira Toriyama',
                                                'Attack on Titan ran for 10 years (2013-2023)',
                                                'The longest anime is Sazae-san with 7000+ episodes',
                                                'Hayao Miyazaki has "retired" at least 8 times',
                                                'Naruto has 720 episodes across both series',
                                                'Demon Slayer broke box office records worldwide',
                                                'Cowboy Bebop was inspired by jazz and blues music',
                                                'Your Name was the highest-grossing anime film for years',
                                            ][funFactIdx % 10]}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Import mode tabs */}
                            <div className="tabs mb-4">
                                <button className={`tab ${importMode === 'file' ? 'active' : ''}`} onClick={() => setImportMode('file')}>
                                    <Upload size={14} /> File Import
                                </button>
                                <button className={`tab ${importMode === 'anilist' ? 'active' : ''}`} onClick={() => setImportMode('anilist')}>
                                    <User size={14} /> AniList
                                </button>
                                <button className={`tab ${importMode === 'text' ? 'active' : ''}`} onClick={() => setImportMode('text')}>
                                    <FileText size={14} /> Text / Paste
                                </button>
                            </div>

                            {importMode === 'file' && (
                                <div className="import-section">
                                    <div className="import-tutorials" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
                                        <div className="import-info-card">
                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2e51a2' }}>
                                                🗂️ How to export from MyAnimeList
                                            </h4>
                                            <ol style={{ paddingLeft: '20px', marginTop: '10px', fontSize: '0.9rem', lineHeight: '1.6' }}>
                                                <li>Go to <strong>MyAnimeList.net</strong> and log in to your account.</li>
                                                <li>Click on your <strong>Profile Picture</strong> at the top right, then select <strong>Account Settings</strong> or <strong>Export</strong>.</li>
                                                <li>Alternatively, go directly to <a href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>this MAL Export link</a>.</li>
                                                <li>Under "Export Type", choose <strong>Anime List</strong>.</li>
                                                <li>Click the <strong>Export My List</strong> button to download a <code>.xml.gz</code> file.</li>
                                            </ol>
                                            <div style={{ marginTop: '12px', borderRadius: '8px', overflow: 'hidden' }}>
                                                <img src={malExportImg} alt="MAL Export Steps" style={{ width: '100%', maxWidth: '100%', height: 'auto', display: 'block', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                                            </div>
                                        </div>

                                        <div className="import-info-card">
                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#02a9ff' }}>
                                                📊 How to export from AniList
                                            </h4>
                                            <ol style={{ paddingLeft: '20px', marginTop: '10px', fontSize: '0.9rem', lineHeight: '1.6' }}>
                                                <li>Go to <strong>AniList.co</strong> and log in.</li>
                                                <li>Click on your <strong>Profile Icon</strong> at the top right and go to <strong>Settings</strong>.</li>
                                                <li>In the left sidebar menu, click on <strong>Apps</strong>.</li>
                                                <li>Scroll down to the <strong>Data Export</strong> section.</li>
                                                <li>Click the <strong>Export Anime List</strong> button to download a <code>.json</code> file.</li>
                                                <li>Or use the direct link: <a href="https://anilist.co/gdpr/download" target="_blank" rel="noreferrer" style={{ color: '#02a9ff', textDecoration: 'underline' }}>AniList GDPR Data Export</a>.</li>
                                            </ol>
                                            <div style={{ marginTop: '12px', borderRadius: '8px', overflow: 'hidden' }}>
                                                <img src={anilistExportImg} alt="AniList Export Steps" style={{ width: '100%', maxWidth: '100%', height: 'auto', display: 'block', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="file-drop-zone" onClick={() => fileInputRef.current?.click()}>
                                        <Upload size={40} style={{ color: 'var(--accent-primary)', marginBottom: 12 }} />
                                        <p style={{ fontWeight: 600, fontSize: '1rem' }}>
                                            {importing ? 'Importing...' : 'Click to browse or drag & drop'}
                                        </p>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                            Supports: .xml.gz, .xml, .json (up to 50MB)
                                        </p>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".xml,.gz,.json,.txt"
                                            onChange={handleFileImport}
                                            style={{ display: 'none' }}
                                        />
                                    </div>
                                </div>
                            )}

                            {importMode === 'anilist' && (
                                <div className="import-section">
                                    {/* AniList Username Import */}
                                    <div className="import-info-card" style={{ borderLeft: '3px solid #02a9ff', marginBottom: '20px' }}>
                                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#02a9ff', marginBottom: 8 }}>
                                            <User size={18} /> Import from AniList
                                        </h4>
                                        <p style={{ fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                                            Enter your AniList username to import your <strong>public</strong> anime list directly. If your list is private, use the <strong>File Import</strong> tab instead with your exported <code>.json</code> file.
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            <input
                                                className="input"
                                                value={anilistUsername}
                                                onChange={e => setAnilistUsername(e.target.value)}
                                                placeholder="Enter AniList username..."
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && anilistUsername.trim() && !importing) {
                                                        handleAniListImport();
                                                    }
                                                }}
                                                style={{ paddingLeft: '36px' }}
                                            />
                                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                        </div>
                                        <button
                                            className="btn btn-gradient"
                                            onClick={handleAniListImport}
                                            disabled={importing || !anilistUsername.trim()}
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            {importing ? (
                                                <>
                                                    <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                                                    Importing...
                                                </>
                                            ) : (
                                                <>
                                                    <Download size={16} /> Fetch & Import
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {/* AniList Profile Preview Card */}
                                    {importResult?.anilistProfile && (
                                        <div className="anilist-profile-card" style={{
                                            background: 'linear-gradient(135deg, rgba(2, 169, 255, 0.08), rgba(124, 92, 252, 0.08))',
                                            border: '1px solid rgba(2, 169, 255, 0.2)',
                                            borderRadius: '12px',
                                            padding: '16px',
                                            marginBottom: '16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                        }}>
                                            <div style={{
                                                width: 56,
                                                height: 56,
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #02a9ff, #7c5cfc)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '1.4rem',
                                                fontWeight: 800,
                                                color: '#fff',
                                                flexShrink: 0,
                                                overflow: 'hidden',
                                            }}>
                                                {importResult.anilistProfile.avatarUrl && importResult.anilistProfile.avatarUrl !== 'default.png' ? (
                                                    <img src={importResult.anilistProfile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    importResult.anilistProfile.displayName?.[0]?.toUpperCase() || '?'
                                                )}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                                                    {importResult.anilistProfile.displayName || importResult.anilistProfile.userName}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '12px', marginTop: 4, flexWrap: 'wrap' }}>
                                                    {importResult.anilistProfile.animeCount > 0 && (
                                                        <span>📺 {importResult.anilistProfile.animeCount} anime</span>
                                                    )}
                                                    {importResult.anilistProfile.meanScore > 0 && (
                                                        <span>⭐ {importResult.anilistProfile.meanScore.toFixed(1)} avg</span>
                                                    )}
                                                    {importResult.anilistProfile.minutesWatched > 0 && (
                                                        <span>⏱️ {Math.round(importResult.anilistProfile.minutesWatched / 60)}h watched</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                                            🔒 Have a private list? Use the <button style={{ color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit' }} onClick={() => setImportMode('file')}>File Import</button> tab with your exported AniList <code>.json</code> file.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {importMode === 'text' && (
                                <div className="import-section">
                                    <div className="import-info-card mb-3">
                                        <h4>✏️ Paste Anime Names</h4>
                                        <p>Enter anime names, one per line. The system will search AniList and add them to your planning list. Works with any format — typed names, copied lists, etc.</p>
                                    </div>
                                    <textarea
                                        className="input"
                                        value={importText}
                                        onChange={e => setImportText(e.target.value)}
                                        placeholder={`Attack on Titan\nDeath Note\nSteins;Gate\nFullmetal Alchemist: Brotherhood\nOne Punch Man\n...`}
                                        rows={10}
                                        style={{ fontFamily: 'var(--font-mono, monospace)' }}
                                    />
                                    <button
                                        className="btn btn-gradient mt-3"
                                        onClick={handleTextImport}
                                        disabled={importing}
                                    >
                                        {importing ? (
                                            <>
                                                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                                                Importing...
                                            </>
                                        ) : (
                                            <>
                                                <Upload size={16} /> Import {importText.split('\n').filter(n => n.trim()).length} Names
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* Import Results */}
                            {importResult && (
                                <div className="import-results mt-4">
                                    <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 12 }}>Import Results</h4>
                                    <div className="import-stats">
                                        <div className="import-stat success">
                                            <span className="import-stat-num">{importResult.imported}</span>
                                            <span>Imported</span>
                                        </div>
                                        <div className="import-stat warning">
                                            <span className="import-stat-num">{importResult.skipped || 0}</span>
                                            <span>Skipped</span>
                                        </div>
                                        <div className="import-stat error">
                                            <span className="import-stat-num">{importResult.failed}</span>
                                            <span>Failed</span>
                                        </div>
                                    </div>
                                    {importResult.results && importResult.results.length > 0 && (
                                        <div className="import-result-list">
                                            <div className="import-filters" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                                <button className={`btn btn-sm ${importFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setImportFilter('all')}>All Results ({importResult.results.length})</button>
                                                <button className={`btn btn-sm ${importFilter === 'failed' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setImportFilter('failed')} style={importFilter === 'failed' ? { background: 'var(--error)', borderColor: 'var(--error)' } : {}}>
                                                    ❌ Failed ({importResult.results.filter((r: any) => r.result === 'Not found' || r.result?.startsWith('Error') || r.result?.startsWith('Confidence')).length})
                                                </button>
                                                <button className={`btn btn-sm ${importFilter === 'resolution' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setImportFilter('resolution')} style={importFilter === 'resolution' ? { background: 'var(--warning)', borderColor: 'var(--warning)' } : {}}>
                                                    ⚠️ Needs Match ({importResult.results.filter((r: any) => r.requireResolution && !r.resolved).length})
                                                </button>
                                            </div>

                                            {importResult.results
                                                .filter((r: any) => {
                                                    if (importFilter === 'all') return true;
                                                    if (importFilter === 'failed') return r.result === 'Not found' || r.result?.startsWith('Error') || r.result?.startsWith('Confidence');
                                                    if (importFilter === 'resolution') return r.requireResolution && !r.resolved;
                                                    return true;
                                                })
                                                .slice(0, importLimit).map((r: any, i: number) => (
                                                    <div key={i} className={`import-result-item ${r.resolved ? 'imported' : r.result}`}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 8 }}>
                                                            <span className="import-result-title">{r.title || r.name}</span>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                                <span className={`import-result-badge ${r.resolved ? 'imported' : r.result}`}>
                                                                    {r.resolved ? `✅ Resolved: ${r.resolvedTitle || 'Added'}` : r.result}
                                                                </span>
                                                                {/* Manual search button for "Not found" items */}
                                                                {r.result === 'Not found' && !r.resolved && (
                                                                    <button
                                                                        className="btn btn-sm btn-ghost"
                                                                        style={{ padding: '2px 8px', fontSize: '0.75rem', border: '1px solid var(--border-color)' }}
                                                                        onClick={() => {
                                                                            if (searchingForItem === i) {
                                                                                setSearchingForItem(null);
                                                                                setManualSearchResults([]);
                                                                                setManualSearchQuery('');
                                                                            } else {
                                                                                setSearchingForItem(i);
                                                                                setManualSearchQuery(r.name || r.title || '');
                                                                                setManualSearchResults([]);
                                                                            }
                                                                        }}
                                                                    >
                                                                        {searchingForItem === i ? '✕ Close' : '🔍 Search'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Manual search panel for "Not found" items */}
                                                        {searchingForItem === i && !r.resolved && (
                                                            <div className="manual-search-panel" style={{ marginTop: 8, padding: 12, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-color)', width: '100%' }}>
                                                                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                                                    <input
                                                                        type="text"
                                                                        className="input input-sm"
                                                                        placeholder="Search anime..."
                                                                        value={manualSearchQuery}
                                                                        onChange={(e) => setManualSearchQuery(e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter' && manualSearchQuery.trim()) {
                                                                                setManualSearchLoading(true);
                                                                                api.searchAnime(manualSearchQuery).then(res => {
                                                                                    setManualSearchResults(res.anime || []);
                                                                                }).catch(() => {
                                                                                    toast.error('Search failed');
                                                                                }).finally(() => setManualSearchLoading(false));
                                                                            }
                                                                        }}
                                                                        style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                                                    />
                                                                    <button
                                                                        className="btn btn-sm btn-primary"
                                                                        disabled={manualSearchLoading || !manualSearchQuery.trim()}
                                                                        onClick={() => {
                                                                            setManualSearchLoading(true);
                                                                            api.searchAnime(manualSearchQuery).then(res => {
                                                                                setManualSearchResults(res.anime || []);
                                                                            }).catch(() => {
                                                                                toast.error('Search failed');
                                                                            }).finally(() => setManualSearchLoading(false));
                                                                        }}
                                                                    >
                                                                        {manualSearchLoading ? '...' : '🔍'}
                                                                    </button>
                                                                </div>
                                                                {manualSearchResults.length > 0 && (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                                                                        {manualSearchResults.slice(0, 8).map((anime: any, aidx: number) => (
                                                                            <div key={aidx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                                                                {anime.coverImage && <img src={anime.coverImage} alt="" style={{ width: 36, height: 52, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
                                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{anime.title || anime.titleEnglish || anime.titleRomaji}</div>
                                                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                                                                                        {anime.format && <span>{anime.format} · </span>}
                                                                                        {anime.episodes && <span>{anime.episodes} ep · </span>}
                                                                                        {anime.averageScore && <span>⭐ {anime.averageScore}%</span>}
                                                                                    </div>
                                                                                </div>
                                                                                <button className="btn btn-sm btn-primary" style={{ flexShrink: 0 }} onClick={async () => {
                                                                                    try {
                                                                                        await api.addToList(anime.id, 'completed');
                                                                                        r.resolved = true;
                                                                                        r.resolvedTitle = anime.title || anime.titleEnglish || anime.titleRomaji;
                                                                                        setImportResult({ ...importResult });
                                                                                        importResult.imported = (importResult.imported || 0) + 1;
                                                                                        importResult.failed = Math.max(0, (importResult.failed || 0) - 1);
                                                                                        setSearchingForItem(null);
                                                                                        setManualSearchResults([]);
                                                                                        toast.success(`✅ Added "${r.resolvedTitle}" to your list!`);
                                                                                        loadList();
                                                                                    } catch (err: any) {
                                                                                        if (err.message?.includes('already')) {
                                                                                            r.resolved = true;
                                                                                            r.resolvedTitle = anime.title || anime.titleEnglish;
                                                                                            setImportResult({ ...importResult });
                                                                                            setSearchingForItem(null);
                                                                                            toast.success('Already in your list!');
                                                                                        } else {
                                                                                            toast.error(err.message || 'Failed to add');
                                                                                        }
                                                                                    }
                                                                                }}>+ Add</button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {manualSearchResults.length === 0 && !manualSearchLoading && manualSearchQuery && (
                                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: 8 }}>Press Enter or click 🔍 to search</div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Interactive UI for ambiguous matches < 80% */}
                                                        {r.requireResolution && !r.resolved && r.candidates && r.candidates.length > 0 && (
                                                            <div className="import-candidates mt-2" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                                {r.candidates.map((cand: any, cidx: number) => (
                                                                    <div key={cidx} className="candidate-card" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', width: '100%' }}>
                                                                        {cand.image && <img src={cand.image} alt="cover" style={{ width: 40, height: 60, objectFit: 'cover', borderRadius: 4 }} />}
                                                                        <div style={{ flex: 1 }}>
                                                                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{cand.title}</div>
                                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{cand.malId ? `MAL: ${cand.malId}` : `AniList: ${cand.id}`}</div>
                                                                        </div>
                                                                        <button className="btn btn-sm btn-primary" onClick={async () => {
                                                                            try {
                                                                                await api.resolveImport({
                                                                                    anilistId: cand.id || undefined,
                                                                                    malId: cand.malId || undefined,
                                                                                    title: cand.title,
                                                                                    status: 'completed',
                                                                                });
                                                                                r.resolved = true;
                                                                                r.resolvedTitle = cand.title;
                                                                                setImportResult({ ...importResult });
                                                                                importResult.imported = (importResult.imported || 0) + 1;
                                                                                importResult.failed = Math.max(0, (importResult.failed || 0) - 1);
                                                                                toast.success(`✅ Added "${cand.title}" to your list!`);
                                                                                loadList();
                                                                            } catch (err: any) {
                                                                                toast.error(err.message || 'Failed to resolve');
                                                                            }
                                                                        }}>Select</button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            {importResult.results.length > importLimit && (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    style={{ width: '100%', marginTop: 8 }}
                                                    onClick={() => setImportLimit(l => l + 50)}
                                                >
                                                    Show {Math.min(50, importResult.results.length - importLimit)} More
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .list-controls {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .list-controls-right {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-left: auto;
        }
        .sort-dropdown {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-secondary);
        }
        .sort-dropdown select {
          padding: 6px 8px;
          font-size: 0.8rem;
          min-width: 120px;
        }
        .view-toggle {
          display: flex;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          overflow: hidden;
        }
        .view-btn {
          padding: 6px 10px;
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
        }
        .view-btn.active {
          background: var(--accent-primary);
          color: white;
        }
        .view-btn:hover:not(.active) {
          color: var(--text-primary);
        }
        .virtual-scroll-container {
          height: calc(100vh - 340px);
          min-height: 400px;
          overflow-y: auto;
          position: relative;
        }
        .virtual-scroll-container::-webkit-scrollbar { width: 6px; }
        .virtual-scroll-container::-webkit-scrollbar-track { background: transparent; }
        .virtual-scroll-container::-webkit-scrollbar-thumb {
          background: rgba(124,92,252,0.3);
          border-radius: 3px;
        }
        .list-items {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .list-item {
          display: flex;
          gap: 16px;
          padding: 16px;
          align-items: flex-start;
          cursor: pointer;
          transition: all 0.15s;
        }
        .list-item:hover {
          border-color: var(--accent-primary);
          transform: translateX(4px);
        }
        .list-item-image {
          width: 80px;
          height: 110px;
          object-fit: cover;
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }
        .list-item-content {
          flex: 1;
          min-width: 0;
        }
        .list-item-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
        }
        .list-item-title {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .list-item-actions {
          display: flex;
          gap: 2px;
          flex-shrink: 0;
        }
        .list-item-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 6px;
          flex-wrap: wrap;
        }
        .list-status-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 600;
        }
        .list-item-rating {
          display: flex;
          align-items: center;
          gap: 3px;
          color: var(--warning);
          font-weight: 600;
        }
        .list-item-tags {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          margin-top: 4px;
          overflow: hidden;
          max-height: 52px;
        }
        .list-item-tags .tag {
          white-space: nowrap;
          flex-shrink: 0;
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .list-item-notes {
          font-size: 0.78rem;
          color: var(--text-secondary);
          margin-top: 2px;
          font-style: italic;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-height: 1.4em;
        }
        .favorite-active svg {
          color: var(--accent-secondary);
        }
        .search-bar-small {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 0 14px;
          flex: 1;
          min-width: 200px;
        }
        .search-bar-small .input {
          border: none;
          background: transparent;
          padding: 10px 0;
        }
        /* Grid view */
        .grid-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        .grid-card {
          position: relative;
          cursor: pointer;
          transition: all 0.2s;
          overflow: hidden;
        }
        .grid-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          border-color: var(--accent-primary);
        }
        .grid-card-img-wrap {
          position: relative;
          overflow: hidden;
        }
        .grid-card-image {
          width: 100%;
          height: 200px;
          object-fit: cover;
          display: block;
        }
        .grid-status-badge {
          position: absolute;
          top: 6px;
          left: 6px;
          width: 24px;
          height: 24px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          backdrop-filter: blur(4px);
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .grid-card-body {
          padding: 10px;
        }
        .grid-card-title {
          font-size: 0.82rem;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-bottom: 4px;
        }
        .grid-card-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
        }
        .grid-ep-count {
          margin-left: auto;
          font-size: 0.65rem;
          color: var(--text-tertiary);
        }
        .grid-progress-wrap {
          margin-top: 6px;
        }
        .grid-progress-track {
          height: 3px;
          background: var(--bg-tertiary);
          border-radius: 2px;
          overflow: hidden;
        }
        .grid-progress-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.5s ease;
        }
        .grid-card-tags {
          display: flex;
          gap: 3px;
          flex-wrap: wrap;
          margin-top: 6px;
          overflow: hidden;
          max-height: 22px;
        }
        .grid-card-tags .tag {
          font-size: 0.6rem;
          padding: 1px 5px;
        }
        .grid-ep-btn {
          position: absolute;
          bottom: 6px;
          right: 6px;
          width: 28px;
          height: 28px;
          border-radius: var(--radius-full);
          background: rgba(124,92,252,0.9);
          border: none;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: all 0.2s;
          backdrop-filter: blur(4px);
          z-index: 3;
        }
        .grid-card:hover .grid-ep-btn {
          opacity: 1;
        }
        @media (hover: none) {
          .grid-ep-btn { opacity: 1; }
        }
        .grid-fav-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 24px;
          height: 24px;
          border-radius: var(--radius-full);
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        /* Import progress */
        .import-progress-overlay {
          position: absolute;
          inset: 0;
          background: var(--bg-secondary);
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-lg);
        }
        .import-progress-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 40px;
          text-align: center;
        }
        .import-progress-ring {
          width: 140px;
          height: 140px;
          animation: import-ring-pulse 2s ease-in-out infinite;
        }
        @keyframes import-ring-pulse {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(124,92,252,0.3)); }
          50% { filter: drop-shadow(0 0 16px rgba(124,92,252,0.6)); }
        }
        .import-progress-label {
          font-size: 1.1rem;
          font-weight: 700;
          font-family: var(--font-display);
        }
        .import-progress-sublabel {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .import-fun-fact {
          max-width: 300px;
          font-size: 0.78rem;
          color: var(--text-tertiary);
          padding: 10px 16px;
          background: var(--bg-primary);
          border-radius: var(--radius-md);
          margin-top: 12px;
          border: 1px solid var(--border-color);
          animation: fact-fade 0.5s ease;
        }
        @keyframes fact-fade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── Sheep Counting Animation ── */
        .sheep-scene {
          position: relative;
          width: 240px;
          height: 120px;
          margin: 0 auto 16px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .sheep-fence {
          position: absolute;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          width: 50px;
          height: 32px;
          border: 3px solid rgba(255,255,255,0.2);
          border-bottom: none;
          border-radius: 4px 4px 0 0;
        }
        .sheep-fence::before,
        .sheep-fence::after {
          content: '';
          position: absolute;
          bottom: 0;
          width: 3px;
          height: 8px;
          background: rgba(255,255,255,0.2);
        }
        .sheep-fence::before { left: 12px; }
        .sheep-fence::after { right: 12px; }
        .sheep-jumping {
          position: absolute;
          bottom: 20px;
          left: 50%;
          animation: sheep-jump 1.6s ease-in-out infinite;
        }
        .sheep-emoji {
          font-size: 2.2rem;
          display: block;
          filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
        }
        @keyframes sheep-jump {
          0% { transform: translateX(-60px) translateY(0) scaleX(1); }
          15% { transform: translateX(-40px) translateY(-40px) scaleX(1); }
          30% { transform: translateX(-10px) translateY(-55px) scaleX(1); }
          50% { transform: translateX(10px) translateY(-55px) scaleX(-1); }
          70% { transform: translateX(40px) translateY(-35px) scaleX(-1); }
          85% { transform: translateX(55px) translateY(0) scaleX(-1); }
          100% { transform: translateX(60px) translateY(0) scaleX(-1); opacity: 0; }
        }
        .sheep-counter {
          position: absolute;
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .sheep-count-num {
          font-size: 2rem;
          font-weight: 900;
          font-family: var(--font-display);
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          line-height: 1;
        }
        .sheep-count-label {
          font-size: 0.65rem;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Import progress bar */
        .import-progress-bar-container {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          max-width: 280px;
          margin: 0 auto 12px;
        }
        .import-progress-bar-track {
          flex: 1;
          height: 8px;
          background: rgba(255,255,255,0.08);
          border-radius: 4px;
          overflow: hidden;
        }
        .import-progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
          border-radius: 4px;
          transition: width 0.3s ease;
          box-shadow: 0 0 12px rgba(124,92,252,0.4);
        }
        .import-progress-pct {
          font-size: 0.9rem;
          font-weight: 800;
          font-family: var(--font-display);
          color: var(--text-primary);
          min-width: 42px;
          text-align: right;
        }
        .dropdown-wrapper {
          position: relative;
          z-index: 30;
        }
        .dropdown-wrapper:hover .dropdown-menu {
          display: flex;
        }
        .dropdown-menu {
          display: none;
          position: absolute;
          top: 100%;
          right: 0;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          flex-direction: column;
          min-width: 140px;
          z-index: 50;
          box-shadow: 0 8px 30px rgba(0,0,0,0.4);
          overflow: hidden;
          margin-top: 4px;
        }
        .dropdown-menu button {
          background: none;
          border: none;
          color: var(--text-primary);
          padding: 10px 16px;
          text-align: left;
          cursor: pointer;
          font-size: 0.85rem;
          transition: background 0.15s;
        }
        .dropdown-menu button:hover {
          background: var(--bg-tertiary);
        }
        .modal-lg {
          max-width: 660px;
          max-height: 85vh;
          overflow-y: auto;
          position: relative;
        }
        .import-info-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }
        .import-info-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 14px;
        }
        .import-info-card h4 {
          font-size: 0.9rem;
          margin-bottom: 6px;
        }
        .import-info-card p {
          font-size: 0.78rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .import-info-card code {
          background: var(--bg-tertiary);
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 0.75rem;
        }
        .file-drop-zone {
          border: 2px dashed var(--border-color);
          border-radius: var(--radius-lg);
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        }
        .file-drop-zone:hover {
          border-color: var(--accent-primary);
          background: rgba(124, 92, 252, 0.05);
        }
        .import-stats {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }
        .import-stat {
          flex: 1;
          text-align: center;
          padding: 12px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.8rem;
          font-weight: 500;
        }
        .import-stat.success { background: rgba(34,197,94,0.1); color: var(--success); }
        .import-stat.warning { background: rgba(245,158,11,0.1); color: var(--warning); }
        .import-stat.error { background: rgba(239,68,68,0.1); color: var(--error); }
        .import-stat-num {
          font-size: 1.5rem;
          font-weight: 800;
          font-family: var(--font-display);
        }
        .import-result-list {
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
        }
        .import-result-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-color);
          font-size: 0.82rem;
        }
        .import-result-item:last-child { border-bottom: none; }
        .import-result-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .import-result-badge {
          font-size: 0.7rem;
          padding: 2px 8px;
          border-radius: 20px;
          font-weight: 600;
          flex-shrink: 0;
          margin-left: 8px;
        }
        .import-result-badge.imported { background: rgba(34,197,94,0.15); color: var(--success); }
        .import-result-badge.skipped { background: rgba(245,158,11,0.15); color: var(--warning); }
        .import-result-badge.failed, .import-result-badge.error { background: rgba(239,68,68,0.15); color: var(--error); }

        /* Progress bar in list items */
        .progress-bar-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }
        .progress-bar-track {
          flex: 1;
          height: 4px;
          background: var(--bg-tertiary);
          border-radius: 2px;
          overflow: hidden;
          max-width: 200px;
        }
        .progress-bar-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.5s ease;
        }
        .progress-bar-label {
          font-size: 0.7rem;
          color: var(--text-tertiary);
          font-weight: 600;
          min-width: 32px;
        }

        /* Quick Stats Bar */
        .quick-stats-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 10px 16px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .quick-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 4px 16px;
          gap: 2px;
        }
        .quick-stat-num {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 800;
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .quick-stat-label {
          font-size: 0.68rem;
          color: var(--text-tertiary);
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        .quick-stat-divider {
          width: 1px;
          height: 28px;
          background: var(--border-color);
        }
        /* Spinning animation for loader */
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .list-item {
            padding: 12px;
            gap: 10px;
          }
          .list-item-image {
            width: 56px;
            height: 80px;
          }
          .list-item-title {
            font-size: 0.88rem;
          }
          .list-item-meta {
            font-size: 0.72rem;
            gap: 6px;
          }
          .list-item-tags {
            max-height: 22px;
          }
          .list-item-tags .tag {
            max-width: 72px;
            font-size: 0.58rem;
          }
          .list-item-notes {
            font-size: 0.7rem;
            max-height: 1.3em;
          }
          .list-item-actions .btn-icon {
            width: 44px;
            height: 44px;
            min-height: 44px;
            min-width: 44px;
          }
          .list-item-actions .btn-icon svg {
            width: 22px;
            height: 22px;
          }
          /* Bigger +1 episode button on mobile */
          .list-item-meta .btn-icon {
            width: 42px !important;
            height: 42px !important;
          }
          .list-item-meta .btn-icon svg {
            width: 26px;
            height: 26px;
          }
          .list-controls {
            flex-direction: column;
            align-items: stretch;
          }
          .list-controls-right {
            margin-left: 0;
            justify-content: space-between;
          }
          .search-bar-small {
            min-width: 0;
          }
          .sort-dropdown select {
            min-width: 100px;
            font-size: 0.75rem;
          }
          .quick-stats-bar {
            flex-wrap: wrap;
            gap: 4px;
            padding: 8px 10px;
          }
          .quick-stat { padding: 4px 8px; }
          .quick-stat-num { font-size: 0.85rem; }
          .quick-stat-label { font-size: 0.6rem; }
          .quick-stat-divider { height: 20px; }
          .virtual-scroll-container {
            height: calc(100vh - 380px);
            min-height: 300px;
          }
          /* Force 2 columns max on mobile grid */
          .grid-row {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px;
          }
          .grid-card-image {
            height: 160px;
          }
          .grid-card-title {
            font-size: 0.72rem;
          }
          .grid-card-meta {
            font-size: 0.65rem;
          }
          .grid-card-tags {
            max-height: 18px;
          }
          .grid-card-tags .tag {
            font-size: 0.55rem;
            padding: 0px 4px;
          }
          .grid-ep-btn {
            opacity: 1;
            width: 30px;
            height: 30px;
          }
          .modal-lg {
            max-width: 100%;
            max-height: 85vh;
            padding-bottom: 70px;
          }
          .import-info-card {
            padding: 10px;
          }
          .import-info-card h4 {
            font-size: 0.82rem;
          }
          .import-info-card ol {
            font-size: 0.8rem !important;
          }
          .file-drop-zone {
            padding: 24px 14px;
          }
          .import-stats {
            gap: 6px;
          }
          .import-stat {
            padding: 8px;
            font-size: 0.72rem;
          }
          .import-stat-num {
            font-size: 1.15rem;
          }
          .progress-bar-track {
            max-width: 150px;
          }
          /* Make +1 button always visible on mobile */
          .list-item-meta .btn-icon {
            opacity: 1;
          }
          /* Tabs scrollable on mobile */
          .tabs {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            flex-wrap: nowrap;
          }
          .tabs::-webkit-scrollbar { display: none; }
          .tab {
            white-space: nowrap;
            flex-shrink: 0;
            min-height: 40px;
          }
          /* Bulk action bar responsive */
          .bulk-action-bar {
            flex-direction: column !important;
            gap: 8px !important;
            text-align: center;
          }
        }

        @media (max-width: 480px) {
          .list-item-image {
            width: 48px;
            height: 68px;
          }
          .list-item-title {
            font-size: 0.82rem;
          }
          .list-item-tags {
            max-height: 44px;
          }
          .grid-card-image {
            height: 130px;
          }
          .quick-stats-bar {
            gap: 2px;
          }
          .quick-stat { padding: 2px 6px; }
          .quick-stat-num { font-size: 0.78rem; }
          .grid-card-body { padding: 8px; }
          .grid-card-title { font-size: 0.68rem; }
          .grid-ep-count { font-size: 0.58rem; }
        }
      `}</style>
        </div>
    );
}
