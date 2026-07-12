# Implementation Walkthrough - AniRec Fixes & Hardening

I have successfully implemented all planned enhancements, resolved the security concerns, and verified the changes through unit tests and automated benchmarks.

---

## 🛠️ Changes Implemented

### 1. Security Hardening (OAuth Tokens)
* **Crypto Utility**: Created [crypto.ts](file:///d:/automatio+n/AniRec/backend/src/utils/crypto.ts) implementing AES-256-GCM.
  * Encrypted payloads use the versioned format: `v1:iv:tag:ciphertext`.
  * Checks for the version prefix to ensure backward compatibility: legacy plaintext tokens continue to work seamlessly.
  * Production fail-safe: The server will crash on startup if `ENCRYPTION_KEY` is not provided while running in `production` mode.
* **Route Integration**: Updated session storage and update routes in [admin.ts](file:///d:/automatio+n/AniRec/backend/src/routes/admin.ts) to encrypt tokens before saving to SQLite and decrypt on retrieval.
* **Unit Testing**: Added [crypto.test.ts](file:///d:/automatio+n/AniRec/backend/src/utils/crypto.test.ts) using Node.js's native test runner to test encryption, decryption, corruption handling, and legacy fallbacks.

---

### 2. Performance Optimizations (Transactions)
* **SQLite Transactions**: Updated bulk import loops (both AniList batch imports and MAL XML parser imports) in [import.ts](file:///d:/automatio+n/AniRec/backend/src/routes/import.ts) to use `db.transaction(...)` for all database writes.
* **Import Benchmark**: Added [benchmark-imports.ts](file:///d:/automatio+n/AniRec/backend/scripts/benchmark-imports.ts) to measure execution times with and without transactions.

---

### 3. Rate-Limiting & Custom Integrations
* **Jikan Queue Throttler**: Replaced the timestamp check in [jikan.ts](file:///d:/automatio+n/AniRec/backend/src/services/jikan.ts) with a serialized promise-chain queue. It uses a `try/finally` block to ensure that subsequent requests are never blocked/stalled if a request fails.
* **Unicode-Aware Dice Similarity**: Created [similarity.ts](file:///d:/automatio+n/AniRec/backend/src/utils/similarity.ts) implementing Sørensen-Dice similarity.
  * Normalizes inputs with `NFKC` and strips non-alphanumeric characters using the Unicode property regex `/[^\p{L}\p{N}\s]/gu` to handle international anime titles correctly.
  * Replaced the deprecated `string-similarity` dependency import in [import.ts](file:///d:/automatio+n/AniRec/backend/src/routes/import.ts).

---

### 4. Configuration & Deployment
* **Configurable `TRUST_PROXY`**: Updated [index.ts](file:///d:/automatio+n/AniRec/backend/src/index.ts) to read the `TRUST_PROXY` environment variable, defaulting to `false` for secure local development.

---

### 5. Selective Dependency Upgrades
* Uninstalled deprecated `string-similarity` and its types.
* Upgraded backend dependencies (`express` to `^4.22.2`, `multer` to `^2.2.0`).
* Upgraded frontend dependencies (`vite` to `^7.3.6`, `react-router-dom` to `^6.30.4`).

---

## 🧪 Verification & Validation Results

### 1. Crypto Unit Tests
Ran native Node.js tests for `crypto.ts`:
```bash
npx tsx src/utils/crypto.test.ts
```
**Output**:
* `should encrypt and decrypt a string successfully` - **Passed** ✅
* `should handle legacy unencrypted plaintext tokens gracefully` - **Passed** ✅
* `should fail decryption when auth tag or ciphertext is corrupted` - **Passed** ✅
* `should handle empty inputs gracefully` - **Passed** ✅

Ran native Node.js integration tests for end-to-end token lifecycle:
```bash
npx tsx src/utils/integration.test.ts
```
**Output**:
* `1. Should store encrypted tokens in the database` - **Passed** ✅
* `2. Should retrieve and decrypt tokens correctly in application flows` - **Passed** ✅
* `3. Should support backward-compatible decryption for legacy plaintext tokens` - **Passed** ✅

---

### 2. Database Import Benchmark
Ran the disk-based import benchmark comparing 500 anime record insertions:
```bash
npx tsx scripts/benchmark-imports.ts
```
**Results**:
* ⏱️ Time **WITHOUT** transaction (auto-commit): **2.33 seconds**
* ⏱️ Time **WITH** transaction (batch commit): **0.014 seconds**
* ⚡ **Speedup: 163.5x faster** (99.4% more efficient) ✅

---

### 3. Compilation & Build Regression Tests
Ran production builds to ensure no compiler regressions:
* **Backend Build**: Compiled successfully.
# Implementation Walkthrough - Background Tasks Redesign

This walkthrough documents the step-by-step progress and verification results of the Background Tasks redesign and Activity Center integration.

---

## 🛠️ Changes Implemented (Task-by-Task)

### Task 1: API Rate Limiting & DB Schema Alterations
- **Monotonic Sync Sequence**: Added a dedicated `library_state` table and a deterministic sequence-based `library_sync_log` log to support timestamp-independent client replication:
  ```sql
  CREATE TABLE library_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      version INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE library_sync_log (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  ```
- **Limiter Splitting**: Configured [index.ts](file:///d:/automatio+n/AniRec/backend/src/index.ts) to skip global rate limiting for status routes `/api/import/status` and `/api/session/guest-status`. Set up a high-threshold status rate limiter at **3,000 requests per 15 minutes** for these endpoints.
- **Unit Testing**: Implemented [db.test.ts](file:///d:/automatio+n/AniRec/backend/src/tests/db.test.ts) verifying the tables are created with proper constraints.

### Task 2: Services Import Module Setup & Typing
- **Service encapsulation**: Implemented a strongly-typed `backend/src/services/import/` module with clean responsibility split. Exposes only `getImportManager()` to hide orchestrator details.
- **Priority-based ImportScheduler**: Created `ImportScheduler` managing concurrency (`maxConcurrentJobs = 2`) and prioritizing imports (`HIGH` > `NORMAL` > `LOW`) using a FIFO fallback queue.
- **SQLite History & Checkpointing**: Decoupled `ImportRepository` to write checkpoints (every 25 items or 5 seconds) and persist job history directly in SQLite (retaining only the last 50 completed/failed runs).
- **EMA ETAs & Immutable Snapshot DTOs**: Integrated Exponential Moving Average (EMA, alpha=0.2) calculation in `ImportManager`. Snapshots are structured-cloned and frozen (`deepFreeze`) to prevent mutable reference leaks.

### Task 3: Decoupled Resolvers & Batch DB Flusher
- **Decoupled ResolverCoordinator**: Created `backend/src/services/import/resolver.ts` separating metadata resolution from Express router logic. Sequences lookup falling back cleanly from AniList to Jikan, with full propagation of `AbortSignal` checks to abort network fetch calls immediately on cancellation.
- **Batch Database Flusher**: Developed `ImportDatabaseService` (`backend/src/services/import/database.ts`) encapsulating the database insert buffer. Features a dual-trigger auto-flush (triggered when 20 items are buffered or 1,000ms passes since the last commit) and handles transaction commits safely. Exposes `shutdown()` to force commit any remaining items.
- **Express Route Delegation**: Re-routed `POST /file`, `POST /anilist-username`, `POST /cancel/:jobId`, and `GET /status/:jobId` in `backend/src/routes/import.ts` to delegate fully to the unified `ImportManager` lifecycle.
- **Unified status list**: Registered the new GET `/api/import/status` route returning the complete snapshot of active, queued, and history import runs.

### Task 4: Library Delta Pagination Sync & Graceful Shutdowns
- **Keyset-Based Delta Sync**: Implemented `GET /api/anime/library/delta` in `backend/src/routes/anime.ts` to support key-set pagination (using `sinceSequence` cursor and `limit`) instead of offset-based queries. It queries `library_sync_log` left-joined with `user_anime` and `anime` to return upserts (with full item payloads) and deletes cleanly.
- **Manual Sync Logging**: Modified standard user list add, edit, and delete routes in `backend/src/routes/anime.ts` to execute inside SQLite transactions that increment `library_state` versions and record updates to `library_sync_log`. This keeps client-side state synchronized regardless of change source.
- **Graceful Shutdown Hook**: Registered `SIGINT`/`SIGTERM` process listeners in `backend/src/index.ts` to stop the scheduler, trigger abort signals on running promises, wait up to 15 seconds for transactions to commit, and close sqlite connections cleanly.
- **Frontend Sync Client**: Defined the `getLibraryDelta` query client method in `frontend/src/utils/api.ts`.

### Task 5: Frontend Context Provider & Transport Sync
- **Transport Abstraction**: Created `frontend/src/utils/importSyncTransport.ts` establishing the `Transport` interface and a default `PollingTransport` client utilizing consolidated polling and adaptive interval scaling (backing off to 10s when idle, scaling up to 1s when active).
- **ImportSyncService State Engine**: Developed `frontend/src/utils/importSyncService.ts` maintaining active jobs, queue statuses, history logs, and sequence cursors. Coordinates keyset-based delta sync pagination on status events, writing sequence offsets to user-specific localStorage entries.
- **Unified React Adapter**: Implemented `frontend/src/context/ImportContext.tsx` declaring the `ImportProvider` container, which instantiates the sync service per authenticated user. Exposed selectors like `activeJobs`, `queuedJobs`, and `completedJobs` to frontend elements.

### Task 6: Persistent Background Tasks Widget UI
- **Persistent Floating HUD Widget**: Implemented `BackgroundTasksWidget.tsx` floating in the bottom-right corner of the layout. Ingests all active, queued, and completed jobs directly from the framework-agnostic `useImport()` context.
- **Dynamic Task Card Render**: Handles collapsed states (showing badge counts) and expanded cards displaying progress, ETAs, active stages, current item resolution details, cancellation triggers, and recently finished/failed job histories.
- **Global App Integration**: Mounted the widget globally in `AppLayout` inside `frontend/src/App.tsx` to enable background task monitoring across all routing contexts.

### Task 7: Incremental Delta Merge & Completion Toasts
- **Centralized Library Store**: Extracted full list management from local page states and centralized it inside `ImportProvider`. Implemented a robust Map-based delta merger that processes additions, updates, and deletes in O(M) time where M is the number of sync changes. Exposes optimistic UI update methods (`addLibraryEntry`, `updateLibraryEntry`, `deleteLibraryEntry`) for immediate feedback.
- **Pulse Animation Event Dispatcher**: Configured the delta merger to dispatch a custom `'library:pulse'` event containing the IDs of newly synced or updated anime. Hooked the grid and list views in `MyListPage.tsx` to observe this event and render animated borders using CSS keyframe transitions.
- **Cooperative Completion Events & Toasts**: Upgraded `ImportSyncService` with status diffing that detects job completions and fires an `onJobFinished` event exactly once. The provider catches these events to notify the user with structured success/error toast alerts and automatically pull final sync deltas.
- **Cleaned Polling Overheads**: Refactored `MyListPage.tsx` to remove over 150 lines of duplicate state declarations, unmount cleanup loops, and polling timers, letting it consume simple selectors and actions from `useImport()`.

### Operational Polish: Visibility-Aware Polling
- **Transport Lifecycle Hooks**: Added `pause()`, `resume()`, and `forcePoll()` methods to `Transport` and `PollingTransport`. When paused, any scheduled timers are cleared, and actual network calls are prevented. Resuming clears the pause flag and executes a polling sync immediately.
- **Provider-Owned Lifecycle Listeners**: Configured `ImportProvider` to handle browser environment states cleanly. It subscribes to `visibilitychange`, `online`, `offline`, and `focus` events. If the tab becomes hidden or offline, polling is paused. If the user returns to the tab or goes back online, polling is immediately resumed with a sync, eliminating delayed intervals.

---

## 🧪 Verification & Validation Results

### 1. Database Schema Unit Tests
Ran the database unit tests inside the backend directory:
```bash
node --import tsx --test src/tests/db.test.ts
```
**Output**:
* `Database has library_state and library_sync_log tables` - **Passed** ✅

### 2. Keyset Pagination Sync Logic Tests
Ran the keyset pagination test checking range queries:
```bash
node --import tsx --test src/tests/delta.test.ts
```
**Output**:
* `Library Delta Sync Keyset Pagination Logic` - **Passed** ✅

### 3. Import Subsystem Integration & Unit Tests
Ran the expanded test suite covering scheduler queueing, snapshot caches, batch flush, cancellation signals, and flusher triggers (time-based & size-based):
```bash
node --import tsx --test src/services/import/import.test.ts
```
**Output**:
* `ImportManager - Job Lifecycle & Snaphots` - **Passed** ✅
* `ImportManager - Status snapshot caching` - **Passed** ✅
* `ImportDatabaseService - Batching and flusher logic` - **Passed** ✅
* `ImportDatabaseService - Time-based flusher trigger` - **Passed** ✅
* `ImportDatabaseService - Size-based flusher trigger (immediate)` - **Passed** ✅
* `ResolverCoordinator - AbortSignal cancellation` - **Passed** ✅

### 4. Compilation & Build Tests
Ran production builds to verify no type regressions:
* **Backend Build (`tsc`)**: Compiled successfully. ✅
* **Frontend Build (`tsc -b && vite build`)**: Compiled successfully. ✅


---

### 4. Documentation & Branding Verification
* **README Refactoring**: Refactored the root `README.md` to include:
  * Clear project identity, highlights metadata table, project philosophy statement, and target audience definitions.
  * Integration of a Mermaid.js diagram displaying the system architecture.
  * Added Creator Card attributing project authorship to **Piyush Das (Piyushdas1624)**.
  * Maintained all quick start guides, features lists, and API endpoint details intact.
  * Rephrased benchmark highlights to reference the backend test suite instead of hardcoded numbers in the main documentation.

---

### 5. Import Pipeline Hardening & Live Model Discovery (Part 2)
* **Asynchronous Import Jobs**:
  * Implemented an in-memory job registry (`activeImportJobs`) tracking active imports, stages, exact counts (AniList, Jikan, Skipped, Failed), and Exponential Moving Average (EMA) ETAs.
  * Updated file/username imports to immediately return `202 Accepted` + `jobId` to prevent reverse proxy/Cloudflare timeouts.
  * Added a SQLite `import_jobs` history table for completed/failed state persistence.
  * Implemented automatic server startup cleanup: any dangling `pending` or `running` imports are marked as `abandoned` rather than `failed`.
  * Integrated check-points at every request iteration to support mid-import **cancellation** by the user.
* **Frontend Polling & UI Enhancements**:
  * Replaced the logarithmic progress simulation with real-time polling (`getImportStatus`) with exponential backoff.
  * Rendered a rich status layout in the import modal displaying the current anime title, current stage, and detailed resolution statistics.
  * Added a **Cancel Import** button allowing users to cancel a running import instantly.
* **Live Gemini Model Discovery & Caching**:
  * Configured `/api/gemini/models` to dynamically query Google's API, supporting both API keys and active Antigravity bearer credentials.
  * Hashed user credentials with SHA-256 before memory caching with a 1-hour TTL to protect sensitive credentials.
  * Updated the settings page dropdown to load models dynamically on page mount, preserve unavailable models as `⚠ [model_id] (Saved, but currently unavailable)` rather than silently overwriting them, and fallback to robust capability-based aliases (`gemini-pro`, `gemini-flash`).

---

### 6. Status Mapping Fixes & Background Modal UX Redesign (Task 8)
* **Robust Status Normalization**:
  * Implemented a case-insensitive `normalizeStatus` utility helper function inside [import.ts](file:///d:/automatio+n/AniRec/backend/src/routes/import.ts).
  * Normalizes alternate string values (`current` -> `watching`, `on-hold` -> `paused`, `Plan to Watch` -> `planning`) and resolves raw numeric status codes (`0` -> `watching`, `2` -> `completed`, etc.) correctly.
  * Used `normalizeStatus` across the entire import pipeline (MAL XML parser, AniList GQL parser, XML background runner, and AniList background runner) to prevent the double-resolution bug where lowercase `completed` was mapped again and defaulted to `planning`.
* **Background Import Dismissal UX**:
  * Removed the modal restriction in [MyListPage.tsx](file:///d:/automatio+n/AniRec/frontend/src/pages/MyListPage.tsx) that prevented users from closing the import dialog during active uploads or imports.
  * Added a visible **Continue in Background** button inside the progress/processing modal overlay.
  * Included a guide label explicitly informing users: `ℹ️ You can safely close this window. Progress is available in the widget at the bottom right.`
  * Added custom highlight dispatcher events to automatically expand and pulse the floating `BackgroundTasksWidget` when users background an active import.
* **Regression Testing**:
  * Appended `Status Normalization - Mapping preservation and fallbacks` unit tests in [import.test.ts](file:///d:/automatio+n/AniRec/backend/src/services/import/import.test.ts) verifying all standard statuses (completed, watching, planning, paused, dropped) map correctly, case-insensitively, and preserve raw values.
  * Manually uploaded a real MAL XML export containing 674 anime records, successfully verifying that the list populated correctly, statuses were preserved without data corruption, and the Background Activity Center monitored progress.
