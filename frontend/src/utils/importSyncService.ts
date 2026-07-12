import api from './api';
import { PollingTransport, type Transport } from './importSyncTransport';

export interface ImportJob {
    jobId: string;
    userId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'abandoned' | 'cancelling';
    stage: string;
    processed: number;
    total: number;
    currentAnime: string;
    currentOperation?: string;
    statistics: {
        resolvedAniList: number;
        resolvedJikan: number;
        skippedAlreadyInList: number;
        failedNotFound: number;
        failedError: number;
    };
    warnings: string[];
    errors: string[];
    createdAt: string;
    completedAt?: string;
}

export interface ImportServiceState {
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
}

export class ImportSyncService {
    private userId: string;
    private transport: Transport;
    private state: ImportServiceState;
    private sinceSequence = 0;
    private isSyncing = false;

    private onStateChange: (state: ImportServiceState) => void;
    private onLibrarySync: (changes: any[], isComplete: boolean) => Promise<void> | void;
    private onJobFinished: (event: {
        jobId: string;
        status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'abandoned' | 'cancelling';
        processed: number;
        total: number;
        errors: string[];
        stage?: string;
    }) => void;

    private previouslyActiveJobIds = new Set<string>();

    constructor(
        userId: string,
        onStateChange: (state: ImportServiceState) => void,
        onLibrarySync: (changes: any[], isComplete: boolean) => Promise<void> | void,
        onJobFinished: (event: any) => void
    ) {
        this.userId = userId;
        this.onStateChange = onStateChange;
        this.onLibrarySync = onLibrarySync;
        this.onJobFinished = onJobFinished;

        // Load sequence cursor from localStorage
        const storedSeq = localStorage.getItem(`anirec_sync_seq_${userId}`);
        this.sinceSequence = storedSeq ? parseInt(storedSeq, 10) : 0;

        this.state = {
            jobs: [],
            activeJobs: [],
            queuedJobs: [],
            completedJobs: [],
            primaryJob: null,
            stats: { running: 0, queued: 0, completed: 0 },
            libraryRevision: null,
        };

        this.transport = new PollingTransport();
        this.transport.subscribe({
            onStatus: (data) => this.handleStatusUpdate(data),
            onError: (err) => console.error('ImportSyncService Transport Error:', err),
        });
    }

    public start(): void {
        this.transport.start();
        // Trigger initial catch-up delta sync
        this.syncLibraryDeltas();
    }

    public stop(): void {
        this.transport.stop();
    }

    public pause(): void {
        this.transport.pause();
    }

    public resume(): void {
        this.transport.resume();
    }

    public async cancelJob(jobId: string): Promise<void> {
        try {
            await api.cancelImport(jobId);
        } catch (err) {
            console.error(`Failed to cancel job ${jobId}:`, err);
        }
    }

    private handleStatusUpdate(data: any): void {
        const active: ImportJob[] = data.jobs?.active || [];
        const queued: ImportJob[] = data.jobs?.queued || [];
        const history: ImportJob[] = data.jobs?.history || [];

        // Track job completion events
        const currentlyActiveIds = new Set([...active, ...queued].map(j => j.jobId));
        
        for (const prevId of this.previouslyActiveJobIds) {
            if (!currentlyActiveIds.has(prevId)) {
                // Find in history to get final status details
                const finishedJob = history.find(j => j.jobId === prevId);
                if (finishedJob) {
                    try {
                        this.onJobFinished({
                            jobId: finishedJob.jobId,
                            status: finishedJob.status,
                            processed: finishedJob.processed,
                            total: finishedJob.total,
                            errors: finishedJob.errors,
                            stage: finishedJob.stage,
                        });
                    } catch (e) {
                        console.error('onJobFinished handler crashed:', e);
                    }
                }
            }
        }
        this.previouslyActiveJobIds = currentlyActiveIds;

        // Primary job: first active job, or first queued job
        const primaryJob = active[0] || queued[0] || null;

        // Map status count stats
        const stats = {
            running: active.length,
            queued: queued.length,
            completed: history.filter(j => j.status === 'completed').length,
        };

        // Combine all jobs
        const allJobs = [...active, ...queued, ...history];

        this.state = {
            jobs: allJobs,
            activeJobs: active,
            queuedJobs: queued,
            completedJobs: history,
            primaryJob,
            stats,
            libraryRevision: data.library?.revision || null,
        };

        this.onStateChange({ ...this.state });

        // Trigger incremental delta catch-up if needed
        this.syncLibraryDeltas();
    }

    private async syncLibraryDeltas(): Promise<void> {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            let hasMore = true;
            let currentSeq = this.sinceSequence;
            const allChanges: any[] = [];

            while (hasMore) {
                const res = await api.getLibraryDelta(currentSeq, 100);
                if (res.changes.length > 0) {
                    allChanges.push(...res.changes);
                    currentSeq = res.nextSequence !== null ? res.nextSequence : currentSeq;
                }
                hasMore = res.hasMore;
            }

            if (allChanges.length > 0) {
                // Await merge handler before advancing local sequence cursor
                await this.onLibrarySync(allChanges, true);
                this.sinceSequence = currentSeq;
                localStorage.setItem(`anirec_sync_seq_${this.userId}`, String(currentSeq));
            }
        } catch (err) {
            console.error('ImportSyncService: Delta sync failed:', err);
        } finally {
            this.isSyncing = false;
        }
    }
}
