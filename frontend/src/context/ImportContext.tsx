import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { ImportSyncService, type ImportJob, type ImportServiceState } from '../utils/importSyncService';

interface ImportContextType {
    // Import state
    jobs: ImportJob[];
    activeJobs: ImportJob[];
    queuedJobs: ImportJob[];
    completedJobs: ImportJob[];
    primaryJob: ImportJob | null;
    stats: {
        running: number;
        queued: number;
        completed: number;
    };
    libraryRevision: {
        version: number;
        lastUpdated: string | number;
    } | null;
    cancelJob: (jobId: string) => Promise<void>;
    registerLibrarySyncListener: (listener: (changes: any[]) => void) => () => void;

    // Library Store state
    libraryList: any[];
    isLibraryLoading: boolean;
    loadLibrary: () => Promise<void>;
    addLibraryEntry: (entry: any) => void;
    updateLibraryEntry: (animeId: number, updates: any) => void;
    deleteLibraryEntry: (animeId: number) => void;
}

const ImportContext = createContext<ImportContextType | null>(null);

export function ImportProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [serviceState, setServiceState] = useState<ImportServiceState>({
        jobs: [],
        activeJobs: [],
        queuedJobs: [],
        completedJobs: [],
        primaryJob: null,
        stats: { running: 0, queued: 0, completed: 0 },
        libraryRevision: null,
    });

    const [libraryList, setLibraryList] = useState<any[]>([]);
    const [isLibraryLoading, setIsLibraryLoading] = useState(true);

    const syncListenersRef = useRef<Set<(changes: any[]) => void>>(new Set());
    const serviceRef = useRef<ImportSyncService | null>(null);

    const loadLibrary = async () => {
        try {
            setIsLibraryLoading(true);
            const { list } = await api.getMyList();
            setLibraryList(list);
        } catch (err) {
            console.error('ImportProvider: Failed to load library:', err);
        } finally {
            setIsLibraryLoading(false);
        }
    };

    // Trigger initial load on mount / user change
    useEffect(() => {
        if (user) {
            loadLibrary();
        } else {
            setLibraryList([]);
            setIsLibraryLoading(false);
        }
    }, [user?.id]);

    const addLibraryEntry = (entry: any) => {
        setLibraryList((prev) => {
            const listMap = new Map(prev.map(item => [item.animeId, item]));
            listMap.set(entry.animeId, entry);
            return Array.from(listMap.values());
        });
    };

    const updateLibraryEntry = (animeId: number, updates: any) => {
        setLibraryList((prev) => {
            return prev.map(item => {
                if (item.animeId === animeId) {
                    return { ...item, ...updates };
                }
                return item;
            });
        });
    };

    const deleteLibraryEntry = (animeId: number) => {
        setLibraryList((prev) => prev.filter(item => item.animeId !== animeId));
    };

    // Central delta merger
    const handleLibrarySync = (changes: any[]) => {
        setLibraryList((prevList) => {
            const listMap = new Map<number, any>();
            for (const item of prevList) {
                listMap.set(item.animeId, item);
            }

            const pulsedIds: number[] = [];

            for (const change of changes) {
                if (change.action === 'delete') {
                    listMap.delete(change.animeId);
                } else if (change.action === 'upsert' && change.entry) {
                    listMap.set(change.animeId, change.entry);
                    pulsedIds.push(change.animeId);
                }
            }

            if (pulsedIds.length > 0) {
                window.dispatchEvent(new CustomEvent('library:pulse', { detail: pulsedIds }));
            }

            return Array.from(listMap.values());
        });

        // Broadcast to custom page listeners if any
        for (const listener of syncListenersRef.current) {
            try {
                listener(changes);
            } catch (e) {
                console.error('ImportProvider Library Sync listener error:', e);
            }
        }
    };

    // Track active user changes
    useEffect(() => {
        if (serviceRef.current) {
            serviceRef.current.stop();
            serviceRef.current = null;
        }

        if (!user) {
            setServiceState({
                jobs: [],
                activeJobs: [],
                queuedJobs: [],
                completedJobs: [],
                primaryJob: null,
                stats: { running: 0, queued: 0, completed: 0 },
                libraryRevision: null,
            });
            return;
        }

        // Initialize service for user
        const service = new ImportSyncService(
            user.id,
            (newState) => {
                setServiceState(newState);
            },
            (changes) => {
                handleLibrarySync(changes);
            },
            (event) => {
                // Toast notifications exactly once per completed/failed job
                const type = event.stage?.includes('AniList') ? 'AniList' : 'MAL XML';
                if (event.status === 'completed') {
                    toast.success(`🎉 ${type} import completed! Processed ${event.processed} anime.`);
                } else if (event.status === 'failed' || event.status === 'abandoned') {
                    toast.error(`❌ ${type} import failed: ${event.errors[0] || 'Unknown error'}`);
                } else if (event.status === 'cancelled') {
                    toast.success(`ℹ️ ${type} import job was cancelled.`);
                }
            }
        );

        serviceRef.current = service;
        service.start();

        return () => {
            if (serviceRef.current) {
                serviceRef.current.stop();
                serviceRef.current = null;
            }
        };
    }, [user?.id]);

    const cancelJob = async (jobId: string) => {
        if (serviceRef.current) {
            await serviceRef.current.cancelJob(jobId);
        }
    };

    const registerLibrarySyncListener = (listener: (changes: any[]) => void) => {
        syncListenersRef.current.add(listener);
        return () => {
            syncListenersRef.current.delete(listener);
        };
    };

    return (
        <ImportContext.Provider
            value={{
                ...serviceState,
                cancelJob,
                registerLibrarySyncListener,
                libraryList,
                isLibraryLoading,
                loadLibrary,
                addLibraryEntry,
                updateLibraryEntry,
                deleteLibraryEntry,
            }}
        >
            {children}
        </ImportContext.Provider>
    );
}

export function useImport() {
    const context = useContext(ImportContext);
    if (!context) {
        throw new Error('useImport must be used within an ImportProvider');
    }
    return context;
}
