import { v4 as uuidv4 } from 'uuid';
import { ImportJob, JobSnapshotDTO, StatusSnapshotDTO, ImportListener, ImportIssue, ImportStage } from './types';
import { ImportScheduler } from './scheduler';
import { ImportRepository } from './repository';

interface InternalJobState {
    job: ImportJob;
    previousThroughputEMA: number;
    lastCheckpointTime: number;
    lastCheckpointProcessed: number;
}

function deepFreeze<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    Object.freeze(obj);
    Object.keys(obj).forEach(key => {
        const val = (obj as any)[key];
        if (typeof val === 'object' && val !== null && !Object.isFrozen(val)) {
            deepFreeze(val);
        }
    });
    return obj;
}

export class ImportManager {
    private activeJobs = new Map<string, InternalJobState>();
    private scheduler: ImportScheduler;
    private listeners = new Set<ImportListener>();
    private cachedSnapshots = new Map<string, { snapshot: StatusSnapshotDTO; time: number }>();

    constructor() {
        this.scheduler = new ImportScheduler({ maxConcurrentJobs: 2 });
    }

    public createJob(userId: string, total: number, priority: 'HIGH' | 'NORMAL' | 'LOW' = 'NORMAL'): string {
        const jobId = uuidv4();
        const job: ImportJob = {
            jobId,
            userId,
            status: 'pending',
            stage: 'Parsing',
            currentOperation: 'Job created in queue',
            processed: 0,
            total,
            currentAnime: '',
            priority,
            statistics: {
                resolvedAniList: 0,
                resolvedJikan: 0,
                skippedAlreadyInList: 0,
                failedNotFound: 0,
                failedError: 0
            },
            issues: [],
            warnings: [],
            errors: [],
            startTime: Date.now(),
            abortController: new AbortController()
        };

        const state: InternalJobState = {
            job,
            previousThroughputEMA: 1.0, // default baseline
            lastCheckpointTime: Date.now(),
            lastCheckpointProcessed: 0
        };

        this.activeJobs.set(jobId, state);
        ImportRepository.saveJob(job);
        this.invalidateCache(userId);
        
        return jobId;
    }

    public startJob(jobId: string, executeFn: (signal: AbortSignal) => Promise<void>): void {
        const state = this.activeJobs.get(jobId);
        if (!state) return;

        state.job.status = 'running';
        ImportRepository.saveJob(state.job);
        this.invalidateCache(state.job.userId);
        this.notifyListeners(state.job);

        this.scheduler.enqueue(jobId, state.job.priority, async () => {
            const currentSignal = state.job.abortController?.signal;
            if (currentSignal?.aborted) {
                this.finishJob(jobId, 'cancelled');
                return;
            }

            try {
                await executeFn(currentSignal!);
                if (currentSignal?.aborted) {
                    this.finishJob(jobId, 'cancelled');
                } else {
                    this.finishJob(jobId, 'completed');
                }
            } catch (err: any) {
                if (err.name === 'AbortError' || currentSignal?.aborted) {
                    this.finishJob(jobId, 'cancelled');
                } else {
                    state.job.errors.push(err.message || 'Fatal import failure');
                    this.finishJob(jobId, 'failed');
                }
            }
        });
    }

    public updateJobProgress(jobId: string, updates: Partial<ImportJob>): void {
        const state = this.activeJobs.get(jobId);
        if (!state) return;

        const job = state.job;
        Object.assign(job, updates);

        const now = Date.now();
        const elapsedSeconds = (now - job.startTime) / 1000;
        
        if (elapsedSeconds > 0 && job.processed > 0) {
            const instantThroughput = job.processed / elapsedSeconds;
            const alpha = 0.2; // EMA smoothing coefficient
            state.previousThroughputEMA = (alpha * instantThroughput) + ((1 - alpha) * state.previousThroughputEMA);
        }

        // Checkpoint logic: 25 items OR 5 seconds elapsed
        const itemsSinceCheckpoint = job.processed - state.lastCheckpointProcessed;
        const timeSinceCheckpoint = now - state.lastCheckpointTime;
        if (itemsSinceCheckpoint >= 25 || timeSinceCheckpoint >= 5000) {
            ImportRepository.saveCheckpoint(
                job.jobId,
                job.processed,
                job.statistics,
                job.issues,
                job.warnings
            );
            state.lastCheckpointTime = now;
            state.lastCheckpointProcessed = job.processed;
        }

        this.invalidateCache(job.userId);
        this.notifyListeners(job);
    }

    public addIssue(jobId: string, issue: ImportIssue): void {
        const state = this.activeJobs.get(jobId);
        if (!state) return;
        state.job.issues.push(issue);
        this.invalidateCache(state.job.userId);
        this.notifyListeners(state.job);
    }

    public addWarning(jobId: string, warning: string): void {
        const state = this.activeJobs.get(jobId);
        if (!state) return;
        state.job.warnings.push(warning);
        this.invalidateCache(state.job.userId);
        this.notifyListeners(state.job);
    }

    public addError(jobId: string, error: string): void {
        const state = this.activeJobs.get(jobId);
        if (!state) return;
        state.job.errors.push(error);
        this.invalidateCache(state.job.userId);
        this.notifyListeners(state.job);
    }

    public finishJob(jobId: string, status: 'completed' | 'failed' | 'cancelled' | 'abandoned'): void {
        const state = this.activeJobs.get(jobId);
        if (!state) return;

        const job = state.job;
        job.status = status;
        job.completedAt = Date.now();
        job.currentOperation = status === 'completed' ? 'Import completed successfully' : `Import ${status}`;

        // Save last checkpoint state and final job state
        ImportRepository.saveJob(job);
        ImportRepository.deleteOldHistory(job.userId, 50);

        this.activeJobs.delete(jobId);
        this.invalidateCache(job.userId);
        this.notifyListeners(job);
    }

    public cancelJob(jobId: string): void {
        const state = this.activeJobs.get(jobId);
        if (!state) return;

        state.job.status = 'cancelling';
        state.job.currentOperation = 'Cancelling active execution...';
        
        // Cancel in scheduler if pending
        this.scheduler.cancel(jobId);

        // Abort running promises
        if (state.job.abortController) {
            state.job.abortController.abort();
        }

        ImportRepository.saveJob(state.job);
        this.invalidateCache(state.job.userId);
        this.notifyListeners(state.job);
    }

    public getJobSnapshot(jobId: string): JobSnapshotDTO | undefined {
        const state = this.activeJobs.get(jobId);
        if (!state) return undefined;
        return this.toSnapshotDTO(state.job);
    }

    public getStatusSnapshot(userId: string): StatusSnapshotDTO {
        const now = Date.now();
        const cached = this.cachedSnapshots.get(userId);
        if (cached && (now - cached.time < 250)) {
            return structuredClone(cached.snapshot);
        }

        const activeList: JobSnapshotDTO[] = [];
        const queuedList: JobSnapshotDTO[] = [];

        for (const state of this.activeJobs.values()) {
            if (state.job.userId === userId) {
                const snapshot = this.toSnapshotDTO(state.job);
                if (state.job.status === 'pending') {
                    queuedList.push(snapshot);
                } else {
                    activeList.push(snapshot);
                }
            }
        }

        const historyList = ImportRepository.getHistory(userId, 20);
        const dbState = ImportRepository.getLibraryState(userId);

        const snapshot: StatusSnapshotDTO = {
            summary: {
                serverTime: now,
                recommendedPollMs: activeList.length > 0 || queuedList.length > 0 ? 1000 : 5000,
                snapshotId: uuidv4()
            },
            jobs: {
                active: activeList,
                queued: queuedList,
                history: historyList
            },
            library: {
                revision: {
                    version: dbState ? dbState.version : 0,
                    lastUpdated: dbState ? dbState.lastUpdated : now
                }
            }
        };

        const cloned = structuredClone(snapshot);
        deepFreeze(cloned);
        this.cachedSnapshots.set(userId, { snapshot: cloned, time: now });
        return cloned;
    }

    public subscribe(listener: ImportListener): void {
        this.listeners.add(listener);
    }

    public unsubscribe(listener: ImportListener): void {
        this.listeners.delete(listener);
    }

    public async shutdown(): Promise<void> {
        console.log('ImportManager: Shutting down active import jobs...');
        
        this.scheduler.stop();

        for (const jobId of this.activeJobs.keys()) {
            this.cancelJob(jobId);
        }

        const startTime = Date.now();
        while (this.activeJobs.size > 0 && (Date.now() - startTime < 15000)) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.activeJobs.size > 0) {
            console.warn(`ImportManager: Shutdown timed out. ${this.activeJobs.size} jobs did not terminate gracefully.`);
            for (const [jobId, state] of this.activeJobs.entries()) {
                state.job.status = 'abandoned';
                state.job.completedAt = Date.now();
                state.job.errors.push('Graceful shutdown timeout');
                ImportRepository.saveJob(state.job);
            }
            this.activeJobs.clear();
        } else {
            console.log('ImportManager: All active jobs terminated gracefully.');
        }
        this.cachedSnapshots.clear();
    }

    private invalidateCache(userId: string): void {
        this.cachedSnapshots.delete(userId);
    }

    private notifyListeners(job: ImportJob): void {
        const snapshot = this.toSnapshotDTO(job);
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            } catch (err) {
                console.error('Error executing ImportListener callback:', err);
            }
        }
    }

    private toSnapshotDTO(job: ImportJob): JobSnapshotDTO {
        const now = Date.now();
        const elapsedSeconds = (now - job.startTime) / 1000;
        
        // Retrieve EMA calculations
        const state = this.activeJobs.get(job.jobId);
        const emaThroughput = state ? state.previousThroughputEMA : 1.0;
        
        let etaSeconds = 0;
        const remaining = job.total - job.processed;
        if (remaining > 0 && emaThroughput > 0) {
            etaSeconds = Math.round(remaining / emaThroughput);
        }

        const snapshot: any = {
            jobId: job.jobId,
            userId: job.userId,
            status: job.status,
            stage: job.stage,
            currentOperation: job.currentOperation,
            processed: job.processed,
            total: job.total,
            currentAnime: job.currentAnime,
            priority: job.priority,
            statistics: { ...job.statistics },
            issues: [...job.issues],
            warnings: [...job.warnings],
            errors: [...job.errors],
            startTime: job.startTime,
            completedAt: job.completedAt
        };

        // Attach calculated snapshots for API responses
        if (job.status === 'running') {
            snapshot.throughput = Number(emaThroughput.toFixed(2));
            snapshot.etaSeconds = etaSeconds;
            snapshot.overallProgress = Math.round((job.processed / job.total) * 100) || 0;
        }

        const cloned = structuredClone(snapshot);
        return deepFreeze(cloned) as JobSnapshotDTO;
    }
}
