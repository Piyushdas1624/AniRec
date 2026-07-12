interface QueuedTask {
    jobId: string;
    priority: 'HIGH' | 'NORMAL' | 'LOW';
    enqueueTime: number;
    executeFn: () => Promise<void>;
}

export interface ImportSchedulerConfig {
    maxConcurrentJobs: number;
}

export class ImportScheduler {
    private config: ImportSchedulerConfig;
    private queue: QueuedTask[] = [];
    private activeCount = 0;
    private runningJobs = new Map<string, Promise<void>>();
    private isStopped = false;

    constructor(config: ImportSchedulerConfig = { maxConcurrentJobs: 2 }) {
        this.config = config;
    }

    public enqueue(jobId: string, priority: 'HIGH' | 'NORMAL' | 'LOW', executeFn: () => Promise<void>): void {
        if (this.isStopped) {
            throw new Error('Scheduler has been stopped');
        }
        this.queue.push({
            jobId,
            priority,
            enqueueTime: Date.now(),
            executeFn
        });
        this.sortQueue();
        this.processQueue();
    }

    public cancel(jobId: string): void {
        const index = this.queue.findIndex(t => t.jobId === jobId);
        if (index !== -1) {
            this.queue.splice(index, 1);
        }
    }

    public stop(): void {
        this.isStopped = true;
        this.queue = [];
    }

    public getActiveCount(): number {
        return this.activeCount;
    }

    public getQueuedCount(): number {
        return this.queue.length;
    }

    private sortQueue(): void {
        const priorityWeights = { HIGH: 3, NORMAL: 2, LOW: 1 };
        this.queue.sort((a, b) => {
            const weightA = priorityWeights[a.priority] || 2;
            const weightB = priorityWeights[b.priority] || 2;
            if (weightA !== weightB) {
                return weightB - weightA;
            }
            return a.enqueueTime - b.enqueueTime;
        });
    }

    private async processQueue(): Promise<void> {
        if (this.isStopped || this.activeCount >= this.config.maxConcurrentJobs || this.queue.length === 0) {
            return;
        }

        const task = this.queue.shift()!;
        this.activeCount++;
        
        const executionPromise = (async () => {
            try {
                await task.executeFn();
            } catch (err) {
                console.error(`Scheduler: Task ${task.jobId} failed:`, err);
            } finally {
                this.activeCount--;
                this.runningJobs.delete(task.jobId);
                this.processQueue();
            }
        })();

        this.runningJobs.set(task.jobId, executionPromise);
    }
}
