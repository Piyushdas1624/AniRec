export type ImportStage = 'Parsing' | 'Resolving' | 'Saving' | 'Finalizing';

export type ImportStatus = 'pending' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'abandoned';

export type ImportIssueType = 'Network' | 'Timeout' | 'NotFound' | 'Duplicate' | 'ParseError';

export interface ImportIssue {
    type: ImportIssueType;
    animeTitle: string;
    malId?: number;
    message: string;
    recoverable: boolean;
}

export interface ImportJobStatistics {
    resolvedAniList: number;
    resolvedJikan: number;
    skippedAlreadyInList: number;
    failedNotFound: number;
    failedError: number;
}

export interface ImportJob {
    jobId: string;
    userId: string;
    status: ImportStatus;
    stage: ImportStage;
    currentOperation: string;
    processed: number;
    total: number;
    currentAnime: string;
    priority: 'HIGH' | 'NORMAL' | 'LOW';
    statistics: ImportJobStatistics;
    issues: ImportIssue[];
    warnings: string[];
    errors: string[];
    startTime: number;
    completedAt?: number;
    abortController?: AbortController;
}

export interface JobSnapshotDTO {
    readonly jobId: string;
    readonly userId: string;
    readonly status: ImportStatus;
    readonly stage: ImportStage;
    readonly currentOperation: string;
    readonly processed: number;
    readonly total: number;
    readonly currentAnime: string;
    readonly priority: 'HIGH' | 'NORMAL' | 'LOW';
    readonly statistics: ImportJobStatistics;
    readonly issues: ImportIssue[];
    readonly warnings: string[];
    readonly errors: string[];
    readonly startTime: number;
    readonly completedAt?: number;
}

export interface StatusSnapshotDTO {
    readonly summary: {
        readonly serverTime: number;
        readonly recommendedPollMs: number;
        readonly snapshotId: string;
    };
    readonly jobs: {
        readonly active: JobSnapshotDTO[];
        readonly queued: JobSnapshotDTO[];
        readonly history: any[];
    };
    readonly library: {
        readonly revision: {
            readonly version: number;
            readonly lastUpdated: number;
        };
    };
}

export type ImportListener = (snapshot: JobSnapshotDTO) => void;
