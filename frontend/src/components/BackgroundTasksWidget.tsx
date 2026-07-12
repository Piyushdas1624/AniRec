import { useState } from 'react';
import { useImport } from '../context/ImportContext';
import { type ImportJob } from '../utils/importSyncService';
import { Loader2, ChevronDown, ChevronUp, X, CheckCircle2, AlertCircle, Clock, Ban } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BackgroundTasksWidget() {
    const {
        activeJobs,
        queuedJobs,
        completedJobs,
        cancelJob,
    } = useImport();

    const [isExpanded, setIsExpanded] = useState(false);

    const totalActiveCount = activeJobs.length + queuedJobs.length;
    const hasAnyJobs = activeJobs.length > 0 || queuedJobs.length > 0 || completedJobs.length > 0;

    if (!hasAnyJobs) {
        return null;
    }

    const handleCancel = async (jobId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (window.confirm('Are you sure you want to cancel this import job?')) {
            try {
                await cancelJob(jobId);
                toast.success('Cancellation request sent.');
            } catch (err: any) {
                toast.error(`Failed to cancel job: ${err.message || err}`);
            }
        }
    };

    // Helper to format stage text
    const formatStage = (job: ImportJob) => {
        if (job.status === 'pending') return 'Waiting in queue...';
        if (job.status === 'cancelling') return 'Cancelling active execution...';
        return job.stage || 'Processing...';
    };

    // Format status label for completed list
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 size={14} className="text-success" style={{ color: 'var(--success)' }} />;
            case 'failed':
            case 'abandoned':
                return <AlertCircle size={14} className="text-error" style={{ color: 'var(--error)' }} />;
            case 'cancelled':
                return <Ban size={14} style={{ color: 'var(--text-tertiary)' }} />;
            default:
                return <Clock size={14} style={{ color: 'var(--text-secondary)' }} />;
        }
    };

    return (
        <div className="tasks-widget-container">
            {/* Header */}
            <div
                className={`tasks-widget-header ${totalActiveCount > 0 ? 'active' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {activeJobs.length > 0 ? (
                        <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 2s linear infinite' }} />
                    ) : (
                        <Clock size={16} style={{ color: totalActiveCount > 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)' }} />
                    )}
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        {activeJobs.length > 0 ? 'Importing Library...' : 'Background Tasks'}
                    </span>
                    {totalActiveCount > 0 && (
                        <span className="tasks-widget-badge">
                            {totalActiveCount}
                        </span>
                    )}
                </div>
                {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>

            {/* Expanded Body */}
            {isExpanded && (
                <div className="tasks-widget-body">
                    {/* Active & Queued Tasks */}
                    {totalActiveCount > 0 && (
                        <div>
                            <div className="tasks-widget-section-title">Active & Queued</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {[...activeJobs, ...queuedJobs].map((job) => {
                                    const percent = job.total > 0 ? Math.min(Math.round((job.processed / job.total) * 100), 100) : 0;
                                    return (
                                        <div key={job.jobId} className="tasks-widget-job-item">
                                            <div className="tasks-widget-job-row">
                                                <div className="tasks-widget-job-title">
                                                    {job.stage?.includes('AniList') ? 'AniList Sync' : 'MAL XML Import'}
                                                </div>
                                                {(job.status === 'running' || job.status === 'pending') && (
                                                    <button
                                                        className="tasks-widget-cancel-btn"
                                                        onClick={(e) => handleCancel(job.jobId, e)}
                                                        title="Cancel import"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="tasks-widget-job-subtitle" style={{ fontSize: '0.75rem' }}>
                                                {formatStage(job)}
                                            </div>

                                            {job.status === 'running' && (
                                                <>
                                                    <div className="tasks-widget-progress-track" style={{ marginTop: '4px' }}>
                                                        <div
                                                            className="tasks-widget-progress-fill running"
                                                            style={{ width: `${percent}%` }}
                                                        />
                                                    </div>
                                                    <div className="tasks-widget-job-row" style={{ marginTop: '2px', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                                                        <span>
                                                            {job.processed} / {job.total} ({percent}%)
                                                        </span>
                                                        {job.currentAnime && (
                                                            <span style={{ maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {job.currentAnime}
                                                            </span>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* History list */}
                    {completedJobs.length > 0 && (
                        <div>
                            <div className="tasks-widget-section-title">Recent History</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {completedJobs.slice(0, 5).map((job) => (
                                    <div key={job.jobId} className={`tasks-widget-history-item ${job.status}`}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            {getStatusIcon(job.status)}
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {job.stage?.includes('AniList') ? 'AniList Sync' : 'MAL XML Import'}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                            {job.status === 'completed' ? `Imported ${job.processed}` : job.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
