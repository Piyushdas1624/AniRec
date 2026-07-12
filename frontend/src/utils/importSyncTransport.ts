import api from './api';

export interface TransportListener {
    onStatus: (data: any) => void;
    onError: (err: any) => void;
}

export interface Transport {
    subscribe(listener: TransportListener): void;
    unsubscribe(listener: TransportListener): void;
    start(): void;
    stop(): void;
    updateInterval(ms: number): void;
    pause(): void;
    resume(): void;
    forcePoll(): Promise<void>;
}

export class PollingTransport implements Transport {
    private listeners = new Set<TransportListener>();
    private intervalMs = 5000;
    private minIntervalMs = 1000;
    private maxIntervalMs = 10000;
    private timer: any = null;
    private isRunning = false;
    private isPaused = false;

    public subscribe(listener: TransportListener): void {
        this.listeners.add(listener);
    }

    public unsubscribe(listener: TransportListener): void {
        this.listeners.delete(listener);
    }

    public start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.isPaused = false;
        this.schedulePoll();
    }

    public stop(): void {
        this.isRunning = false;
        this.isPaused = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    public pause(): void {
        this.isPaused = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    public resume(): void {
        if (!this.isPaused) return;
        this.isPaused = false;
        if (this.isRunning) {
            this.poll();
        }
    }

    public async forcePoll(): Promise<void> {
        if (!this.isRunning || this.isPaused) return;
        if (this.timer) clearTimeout(this.timer);
        await this.poll();
    }

    public updateInterval(ms: number): void {
        this.intervalMs = Math.max(this.minIntervalMs, Math.min(ms, this.maxIntervalMs));
        if (this.isRunning && !this.isPaused) {
            if (this.timer) clearTimeout(this.timer);
            this.schedulePoll();
        }
    }

    private schedulePoll(): void {
        if (this.timer) clearTimeout(this.timer);
        if (!this.isRunning || this.isPaused) return;
        this.timer = setTimeout(() => this.poll(), this.intervalMs);
    }

    private async poll(): Promise<void> {
        if (!this.isRunning || this.isPaused) return;

        try {
            const data = await api.getConsolidatedStatus();
            
            for (const listener of this.listeners) {
                try {
                    listener.onStatus(data);
                } catch (e) {
                    console.error('PollingTransport listener error:', e);
                }
            }

            // Adaptive backoff: if active or queued jobs are running, poll fast (1s)
            const hasActiveJobs = (data.jobs?.active?.length > 0) || (data.jobs?.queued?.length > 0);
            if (hasActiveJobs) {
                this.intervalMs = this.minIntervalMs;
            } else {
                // Decay back to max interval
                this.intervalMs = Math.min(this.intervalMs * 1.5, this.maxIntervalMs);
            }
        } catch (err: any) {
            console.warn('PollingTransport error:', err.message || err);
            for (const listener of this.listeners) {
                try {
                    listener.onError(err);
                } catch (e) {}
            }
            // Backoff on error
            this.intervalMs = this.maxIntervalMs;
        }

        if (this.isRunning && !this.isPaused) {
            this.schedulePoll();
        }
    }
}
