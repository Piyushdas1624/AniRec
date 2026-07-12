import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { ImportSyncService, type ImportJob, type ImportServiceState } from '../utils/importSyncService';

interface ImportContextType {
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

    const syncListenersRef = useRef<Set<(changes: any[]) => void>>(new Set());
    const serviceRef = useRef<ImportSyncService | null>(null);

    // Track active user changes
    useEffect(() => {
        // Stop previous service if running
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
                for (const listener of syncListenersRef.current) {
                    try {
                        listener(changes);
                    } catch (e) {
                        console.error('ImportProvider Library Sync listener error:', e);
                    }
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
