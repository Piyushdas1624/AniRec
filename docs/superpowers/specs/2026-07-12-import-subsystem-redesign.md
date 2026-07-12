# 2026-07-12 - Background Import Subsystem & Activity Center Design Specification

This document defines the redesign of the AniRec Import Subsystem to move from a blocking, modal-driven experience to a robust, non-blocking background task architecture. It supports dynamic model discovery, state-based cancellation, resilient rate-limiting bypasses, and pagination-supported delta-based library synchronization.

---

## 1. System Architecture Overview

```
                      +---------------------------------------+
                      |               Frontend                |
                      |   (MyListPage, Settings, Widget)      |
                      +---------------------------------------+
                                          │
                                          ▼ [Actions]
                      +---------------------------------------+
                      |         ImportContext / Provider      |
                      +---------------------------------------+
                                          │
                                          ▼ [State updates]
                      +---------------------------------------+
                      |          Transport Interface          |
                      |   (PollingTransport / SSETransport)   |
                      +---------------------------------------+
                                          │
                        HTTP requests     │ [GET /api/import/status]
                                          ▼
                      +---------------------------------------+
                      |           Express Router              |
                      +---------------------------------------+
                                          │
                                          ▼
                      +---------------------------------------+
                      |            ImportManager              |
                      |  (Orchestrator, In-Memory Registry)   |
                      |          * Owns Scheduler *           |
                      +---------------------------------------+
                        │                 │                 │
                        ▼                 ▼                 ▼
          +-------------+   +-------------+   +-------------+
          |  Resolvers  |   | Repository  |   | DB Service  |
          | (AniList /  |   |  (SQLite    |   |  (Batch     |
          |   Jikan)    |   | Repository) |   |  Flusher)   |
          +-------------+   +-------------+   +-------------+
```

---

## 2. API & Network Layer Specification

### Consolidated Status Endpoint
* **GET `/api/import/status`**
* **Response Payload Structure**:
  ```json
  {
    "summary": {
      "serverTime": 1783844891470,
      "recommendedPollMs": 1000,
      "snapshotId": "string"
    },
    "jobs": {
      "active": [
        {
          "jobId": "string",
          "status": "pending" | "running" | "cancelling",
          "stage": "Parsing" | "ResolvingAniList" | "ResolvingJikan" | "Saving" | "Finalizing",
          "currentOperation": "string",
          "processed": 392,
          "total": 674,
          "overallProgress": 61,
          "throughput": 1.32,
          "etaSeconds": 221,
          "priority": "HIGH" | "NORMAL" | "LOW",
          "currentAnime": "string",
          "statistics": {
            "resolvedAniList": 249,
            "resolvedJikan": 91,
            "skippedAlreadyInList": 41,
            "failedNotFound": 10,
            "failedError": 2
          },
          "issues": [
            {
              "type": "Network" | "Timeout" | "NotFound" | "Duplicate" | "ParseError",
              "animeTitle": "string",
              "malId": 123,
              "message": "string",
              "recoverable": true
            }
          ],
          "warnings": ["string"],
          "errors": ["string"]
        }
      ],
      "queued": [
        {
          "jobId": "string",
          "status": "pending",
          "total": 120,
          "priority": "NORMAL"
        }
      ],
      "history": [
        {
          "jobId": "string",
          "status": "completed" | "cancelled" | "failed" | "abandoned",
          "statistics": {
            "resolvedAniList": 600,
            "resolvedJikan": 21,
            "skippedAlreadyInList": 0,
            "failedNotFound": 0,
            "failedError": 0
          },
          "completedAt": 1783844891470
        }
      ]
    },
    "library": {
      "revision": {
        "version": 245,
        "lastUpdated": 1783844891470
      }
    }
  }
  ```

### Library Delta Sync Endpoint (Cursor Pagination)
* **GET `/api/library/delta`**
* **Query Parameters**:
  * `sinceSequence: number`
  * `cursor: string` (optional, for next page offset)
  * `limit: number` (optional, defaults to 50)
* **Response Payload**:
  ```json
  {
    "entries": [
      {
        "id": "string",
        "animeId": 1234,
        "title": "string",
        "status": "string",
        "rating": 9,
        "episodesWatched": 12,
        "notes": "string"
      }
    ],
    "nextCursor": "string" | null,
    "hasMore": boolean,
    "latestRevision": {
      "version": 245,
      "lastUpdated": 1783844891470
    },
    "estimatedRemaining": 270
  }
  ```

---

## 3. Backend Services & Pipeline Specification

### Service Module Directory Structure
We will group all import-related services inside the `backend/src/services/import/` folder:
* `backend/src/services/import/manager.ts`
* `backend/src/services/import/repository.ts`
* `backend/src/services/import/database.ts`
* `backend/src/services/import/resolver.ts`
* `backend/src/services/import/types.ts`
* `backend/src/services/import/index.ts` (Dependency injection container interface)

### Service Architecture
1. **`ImportManager` (Orchestrator)**
   * Schedules jobs, calculates ETAs and throughput, and fires lifecycle events: `onJobStarted`, `onProgressChanged`, `onCancelled`, `onCompleted`, and `onFailed`.
   * Owns and manages the `ImportScheduler` internally. Routes/consumers communicate exclusively with `ImportManager`.
   * Calculates ETAs using **Exponential Moving Average (EMA, alpha = 0.2)** to prevent layout ETA jumps.
   * Exposes immutable DTO snapshots of active jobs (`getJobSnapshot()`, `getStatusSnapshot()`) to prevent direct mutations by consumer services.
   * Manages the global `libraryRevision` counter. **The library version increments only once after the entire import job succeeds** (rather than on every buffer flush) by updating a dedicated `library_state` table.
   * Holds only `active` and `queued` jobs in RAM. History jobs are fetched dynamically from SQLite.
2. **`ImportScheduler`**
   * Configures concurrency using `ImportSchedulerConfig` (`maxConcurrentJobs = 2`).
   * Manages concurrent background imports, priorities (HIGH > NORMAL > LOW with FIFO sequencing), retries, and job execution.
3. **`ResolverCoordinator`**
   * Orchestrates resolver flows: delegating queries sequentially from `AniListResolver` to `JikanResolver`.
4. **`ImportDatabaseService`**
   * Implements a **dual-trigger flush buffer**: writes entries to SQLite via transaction when **20 items are buffered** OR **1,000ms have elapsed** since the last commit. Exposes `enqueue()`, `flush()`, and `shutdown()`.
5. **`ImportRepository`**
   * Manages SQLite access to `import_jobs`, `library_state`, and `library_sync_log` tables using strongly-typed models (no `any` types), fetching history dynamically.
   * Periodically writes progress checkpoints based on count (every 25 items) OR time (every 5 seconds) to handle stalled queries.
   * Exposes `getHistory`, `saveCheckpoint`, `saveJob`, and `updateLibraryState`.
   * **History Cleanup Policy**: Retains the last 50 completed/cancelled/failed jobs in the repository database, auto-pruning anything older.

### Database Schema for Replication Sync
To ensure deterministic, timestamp-independent delta synchronization:
* **`library_state`**: Stores the single global version number for each user.
  ```sql
  CREATE TABLE library_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      version INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now'))
  );
  ```
* **`library_sync_log`**: An incremental sync log recording which `anime_id` was updated in which version.
  ```sql
  CREATE TABLE library_sync_log (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  ```
* **Transactional Guarantee**: Saving a job checkpoint, inserting to `library_sync_log`, and updating the `library_state` counter are wrapped in a single SQLite database transaction to guarantee consistency.
* Delta Query:
  ```sql
  SELECT ua.*, a.title_english, a.title_romaji 
  FROM library_sync_log lsl
  JOIN user_anime ua ON lsl.user_id = ua.user_id AND lsl.anime_id = ua.anime_id
  JOIN anime a ON ua.anime_id = a.id
  WHERE lsl.user_id = :userId AND lsl.sequence > :sinceSequence
  ORDER BY lsl.sequence ASC
  LIMIT :limit OFFSET :offset;
  ```

### Abortable Cancellation & Jikan Queue
* **Explicit Job States**: Exposes states `Cancelling` and `Cancelled` (Pause is omitted to reduce Jikan rate queue complexity).
* **Cancellation State Machine**:
  ```
  Pending -> Running -> Cancelling -> Cancelled
  Running -> Completed
  Running -> Failed
  Pending -> Abandoned
  ```
* **Abort Controllers**: An `AbortController` is attached to every import job. Every async query, delay, or wait receives the job's `AbortSignal`.
* **Queue Cleanup**: The Jikan rate-limiter queue allows removing queued jobs before they are executed.
* **Graceful Exit**: `SIGTERM` and `SIGINT` trigger a graceful shutdown sequence. Resolver queue is stopped, new imports are rejected, active jobs are abort-signalled, and we wait up to **15 seconds** to flush all database flusher buffers, checkpoint progress, close the DB cleanly, and exit.

---

## 4. Frontend Architecture Specification

### State Layer (`ImportProvider`)
* Exposers selectors: `jobs`, `activeJobs`, `queuedJobs`, `completedJobs`, `primaryJob` (highest priority running job).
* Networking is isolated via the `Transport` interface:
  ```typescript
  interface Transport {
      start(): void;
      stop(): void;
      subscribe(listener: (data: any) => void): void;
      unsubscribe(listener: (data: any) => void): void;
  }
  ```
* The client respects `recommendedPollMs` in payload to dynamically scale polling intervals:
  * **1,000ms** if expanded (or dynamic override).
  * **5,000ms** if collapsed (or dynamic override).
  * **10,000ms** if tab/page is hidden.
  * Polling halts if there are no active/queued/cancelling jobs.
  * Polling backoffs exponentially (1s -> 2s -> 4s -> 8s -> max 30s) on server failure, resetting immediately upon first success.

### Root Persistent Background Tasks Widget
* Mounted at the root application layer (`<App>`) so it survives route navigation.
* **Collapsed View**: SVG circular progress ring showing `overallProgress` percent and current status event.
* **Expanded View**: Task manager list supporting cancel, details, and history dismissal.
* Completed jobs remain highlighted in a success state for **30 seconds** before automatically minimizing to the history list.

### Incremental Delta Loading
* When `libraryRevision.version` changes, show a floating bar in `<MyListPage />`:
  * `⬆ {count} new anime imported. [Load Now] [Always Auto Update]`
* When merged, it fetches `/api/library/delta?sinceSequence=X` page-by-page. Newly resolved anime are prepended to the local React state, keeping viewport scroll position, filters, and search queries active. New entries are faded in with an `✨ Imported` tag that remains for 5 seconds.
* **Auto-Update**: If enabled, the client periodically merges entries if they are at the top of the list, avoiding scroll jumps.

---

## 5. Accessibility & Mobile Adaptations
* Screen readers are notified using `aria-live="polite"` on completed jobs.
* Layout adapts to mobile viewports (`width < 768px`) by rendering as a sliding bottom-sheet pill.
