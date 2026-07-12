# Asynchronous Import Subsystem & Activity Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the blocking import dialog into an asynchronous background task pipeline using a dedicated `services/import/` module on the backend, a root Activity Center widget on the frontend, and a paginated library delta sync.
**Updated goal (Task 8):** Fix the status mapping pipeline to preserve raw/GQL status fields during imports (avoiding double-resolution defaults) and update the import modal's UX so it can be dismissed during running jobs to continue in the background.

**Architecture:** Encapsulate import logic into an application container using `ImportManager` (which owns `ImportScheduler` internally), `ImportRepository`, and decoupled resolver/database services. Expose a unified status payload, bypass rate limiters, propagate `AbortSignal` for instant cancellation, and sync client state incrementally.

**Tech Stack:** TypeScript, Node.js, Express, better-sqlite3, React, Tailwind CSS / Vanilla CSS.

## Global Constraints
- **Module Structure**: All import logic must live inside `backend/src/services/import/`. Expose only `getImportManager()`.
- **Limiter Limits**: Dedicated import status rate limit = 3000 requests per 15 minutes. Standard API rate limit = 100 requests per 15 minutes.
- **Checkpoints**: Checkpoints committed to SQLite every 25 processed items OR 5 seconds.
- **Polling Intervals**: Client dynamically adapts intervals to browser tab visibility and widget state, respecting the server's `recommendedPollMs`.
- **Database Flusher**: Batches writes committing on 20 entries OR 1000ms. Revision increments once on complete in `library_state` and `library_sync_log` tables.

---

### Task 1: Rate Limiting & DB Schema Alterations

**Files:**
- Modify: [backend/src/index.ts](file:///d:/automatio+n/AniRec/backend/src/index.ts)
- Modify: [backend/src/utils/initDb.ts](file:///d:/automatio+n/AniRec/backend/src/utils/initDb.ts)

**Interfaces:**
- Consumes: Database schema definitions, Express request pipeline.
- Produces: `library_state` and `library_sync_log` tables, split rate limiters.

- [ ] **Step 1: Write test verifying library_state and library_sync_log tables exist**
  Create `backend/src/utils/test-db-revision.ts`:
  ```typescript
  import db from '../utils/db';
  import assert from 'assert';
  function test() {
      const stateTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='library_state'").get() as any;
      assert.ok(stateTable, 'library_state table does not exist');
      
      const syncTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='library_sync_log'").get() as any;
      assert.ok(syncTable, 'library_sync_log table does not exist');
      console.log('library_state and library_sync_log test passed ✅');
  }
  test();
  ```
- [ ] **Step 2: Run test and verify it fails**
  Run: `npx tsx backend/src/utils/test-db-revision.ts`
  Expected: FAIL with assertion error.
- [ ] **Step 3: Modify initDb.ts to create library_state and library_sync_log tables**
  Update the database initialization in [backend/src/utils/initDb.ts](file:///d:/automatio+n/AniRec/backend/src/utils/initDb.ts) to create these tables:
  ```sql
  CREATE TABLE IF NOT EXISTS library_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      version INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS library_sync_log (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  ```
- [ ] **Step 4: Split rate limiters in index.ts**
  Refactor rate limiters in [backend/src/index.ts](file:///d:/automatio+n/AniRec/backend/src/index.ts) to skip status endpoints and apply a dedicated high-limit status rate limiter (3000 requests / 15 mins).
- [ ] **Step 5: Run tests and verify success**
  Run: `npx tsx backend/src/utils/test-db-revision.ts`
  Expected: PASS
- [ ] **Step 6: Remove test file and commit**
  ```bash
  rm backend/src/utils/test-db-revision.ts
  git add backend/src/utils/initDb.ts backend/src/index.ts
  git commit -m "feat: split rate limiters and add library_state and library_sync_log tables"
  ```

---

### Task 2: Services Import Module Setup & Typing

**Files:**
- Create: `backend/src/services/import/types.ts`
- Create: `backend/src/services/import/repository.ts`
- Create: `backend/src/services/import/manager.ts`
- Create: `backend/src/services/import/scheduler.ts`
- Create: `backend/src/services/import/index.ts`

**Interfaces:**
- Consumes: SQLite database connections.
- Produces: `getImportManager` service container and strongly-typed repositories.

- [ ] **Step 1: Write unit tests for import service classes**
  Create `backend/src/services/import/import.test.ts`:
  ```typescript
  import test from 'node:test';
  import assert from 'assert';
  import { ImportManager } from './manager';
  
  test('ImportManager job creation', () => {
      const manager = new ImportManager();
      const jobId = manager.createJob('user123', 'file', 50);
      assert.ok(jobId);
      const snapshot = manager.getStatusSnapshot();
      assert.strictEqual(snapshot.jobs.active.length, 0); // starts as queued/pending
  });
  ```
- [ ] **Step 2: Implement types.ts**
  Create [backend/src/services/import/types.ts](file:///d:/automatio+n/AniRec/backend/src/services/import/types.ts) declaring `ImportJob`, `ImportStage`, `ImportIssue`, and `ImportListener` types.
- [ ] **Step 3: Implement repository.ts**
  Create [backend/src/services/import/repository.ts](file:///d:/automatio+n/AniRec/backend/src/services/import/repository.ts) with `saveJob(job: ImportJob)`, `getHistory(limit: number)`, and `saveCheckpoint(...)`. Ensure history is dynamically loaded from SQLite.
- [ ] **Step 4: Implement scheduler.ts**
  Create [backend/src/services/import/scheduler.ts](file:///d:/automatio+n/AniRec/backend/src/services/import/scheduler.ts) scheduling concurrent runs, priorities (HIGH > NORMAL > LOW with FIFO sequencing), and abort flags.
- [ ] **Step 5: Implement manager.ts**
  Create [backend/src/services/import/manager.ts](file:///d:/automatio+n/AniRec/backend/src/services/import/manager.ts) managing active/queued states, 250ms snapshot cache, EMA ETAs (alpha = 0.2), and dynamic `libraryRevision` increments in `library_state`. Expose `getJobSnapshot()` and `getStatusSnapshot()` returning deep clones/DTOs. Own the `ImportScheduler` internally.
- [ ] **Step 6: Implement index.ts**
  Create [backend/src/services/import/index.ts](file:///d:/automatio+n/AniRec/backend/src/services/import/index.ts) exporting `getImportManager()`. Do not export the scheduler directly.
- [ ] **Step 7: Run tests and verify they pass**
  Run: `node --import tsx --test backend/src/services/import/import.test.ts`
  Expected: PASS
- [ ] **Step 8: Commit changes**
  ```bash
  git add backend/src/services/import/
  git commit -m "feat: implement import services types, repository, scheduler, and manager"
  ```

---

### Task 3: Decoupled Resolvers & Batch DB Flusher

**Files:**
- Create: `backend/src/services/import/resolver.ts`
- Create: `backend/src/services/import/database.ts`
- Modify: [backend/src/routes/import.ts](file:///d:/automatio+n/AniRec/backend/src/routes/import.ts)

**Interfaces:**
- Consumes: `ImportManager` lifecycle hooks and abort controllers.
- Produces: Incremental resolution loops and batch database commits.

- [ ] **Step 1: Write test for resolution abortion**
  Create `backend/src/services/import/abort.test.ts`:
  ```typescript
  import test from 'node:test';
  import assert from 'assert';
  import { ResolverCoordinator } from './resolver';

  test('ResolverCoordinator aborts on signal', async () => {
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
          ResolverCoordinator.resolve(1, 'Steins;Gate', controller.signal),
          /AbortError/
      );
  });
  ```
- [ ] **Step 2: Implement resolver.ts**
  Create [backend/src/services/import/resolver.ts](file:///d:/automatio+n/AniRec/backend/src/services/import/resolver.ts) declaring `ResolverCoordinator` executing `AniListResolver` -> `JikanResolver` chains.
- [ ] **Step 3: Implement database.ts with dual-trigger flusher**
  Create [backend/src/services/import/database.ts](file:///d:/automatio+n/AniRec/backend/src/services/import/database.ts) declaring `ImportDatabaseService` with `enqueue`, `flush`, and `shutdown`.
- [ ] **Step 4: Refactor routes/import.ts endpoints**
  Update [backend/src/routes/import.ts](file:///d:/automatio+n/AniRec/backend/src/routes/import.ts) endpoints to delegate resolution to `getImportManager()`.
- [ ] **Step 5: Run tests and verify success**
  Run: `node --import tsx --test backend/src/services/import/abort.test.ts`
  Expected: PASS
- [ ] **Step 6: Remove test files and commit**
  ```bash
  rm backend/src/services/import/abort.test.ts
  git add backend/src/services/import/resolver.ts backend/src/services/import/database.ts backend/src/routes/import.ts
  git commit -m "feat: implement abortable resolvers and batch database service"
  ```

---

### Task 4: Library Delta Pagination Sync & Graceful Shutdowns

**Files:**
- Modify: [backend/src/routes/anime.ts](file:///d:/automatio+n/AniRec/backend/src/routes/anime.ts)
- Modify: [frontend/src/utils/api.ts](file:///d:/automatio+n/AniRec/frontend/src/utils/api.ts)
- Modify: [backend/src/index.ts](file:///d:/automatio+n/AniRec/backend/src/index.ts)

**Interfaces:**
- Consumes: `sinceSequence` integer parameter.
- Produces: Cursor-paginated library changes, graceful process exit bindings.

- [ ] **Step 1: Write test for paginated library sync**
  Create `backend/src/routes/delta-paginated.test.ts`:
  ```typescript
  import test from 'node:test';
  import assert from 'assert';
  import fetch from 'node-fetch';

  test('Delta endpoint returns hasMore property', async () => {
      const res = await fetch('http://localhost:3001/api/anime/library/delta?sinceSequence=0&limit=5');
      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.ok('hasMore' in data);
  });
  ```
- [ ] **Step 2: Implement delta sync route in anime.ts**
  Add endpoint `/library/delta` in [backend/src/routes/anime.ts](file:///d:/automatio+n/AniRec/backend/src/routes/anime.ts) mapping `sinceSequence`, `cursor`, and `limit`. Query from the global `library_sync_log` table to fetch delta updates:
  ```sql
  SELECT ua.*, a.title_english, a.title_romaji 
  FROM library_sync_log lsl
  JOIN user_anime ua ON lsl.user_id = ua.user_id AND lsl.anime_id = ua.anime_id
  JOIN anime a ON ua.anime_id = a.id
  WHERE lsl.user_id = ? AND lsl.sequence > ?
  ORDER BY lsl.sequence ASC
  LIMIT ?;
  ```
- [ ] **Step 3: Update API client utility**
  Refactor `getLibraryDelta` in [frontend/src/utils/api.ts](file:///d:/automatio+n/AniRec/frontend/src/utils/api.ts) to support optional `cursor` and `limit`.
- [ ] **Step 4: Implement process lifecycle exits in index.ts**
  Bind `SIGINT` and `SIGTERM` in [backend/src/index.ts](file:///d:/automatio+n/AniRec/backend/src/index.ts) to call `shutdown()` on resolvers, scheduler, database buffers, repository checkpoints, and DB handles cleanly. Wait up to 15 seconds.
- [ ] **Step 5: Verify tests pass**
  Run: `node --import tsx --test backend/src/routes/delta-paginated.test.ts`
  Expected: PASS
- [ ] **Step 6: Clean up test files and commit**
  ```bash
  rm backend/src/routes/delta-paginated.test.ts
  git add backend/src/routes/anime.ts frontend/src/utils/api.ts backend/src/index.ts
  git commit -m "feat: add cursor paginated library delta sync route and graceful exit bindings"
  ```

---

### Task 5: Frontend Context Provider & Transport Sync

**Files:**
- Create: `frontend/src/context/ImportContext.tsx`
- Create: `frontend/src/services/ImportSyncService.ts`
- Create: `frontend/src/services/PollingTransport.ts`
- Modify: [frontend/src/App.tsx](file:///d:/automatio+n/AniRec/frontend/src/App.tsx)

**Interfaces:**
- Consumes: API status checks.
- Produces: React selectors `activeJobs`, `queuedJobs`, `completedJobs`, `primaryJob` and actions `startImport` and `cancelImport`.

- [ ] **Step 1: Create PollingTransport and Transport Interface**
  Create `frontend/src/services/Transport.ts` declaring abstract/interface structures with `start`, `stop`, `subscribe`, and `unsubscribe`. Create [frontend/src/services/PollingTransport.ts](file:///d:/automatio+n/AniRec/frontend/src/services/PollingTransport.ts) resolving polling tasks.
- [ ] **Step 2: Implement ImportSyncService**
  Create [frontend/src/services/ImportSyncService.ts](file:///d:/automatio+n/AniRec/frontend/src/services/ImportSyncService.ts) wrapping `Transport` and supporting adaptive intervals matching `recommendedPollMs`.
- [ ] **Step 3: Implement ImportProvider context container**
  Create [frontend/src/context/ImportContext.tsx](file:///d:/automatio+n/AniRec/frontend/src/context/ImportContext.tsx). Expose selectors and the synchronization lifecycle.
- [ ] **Step 4: Wrap App.tsx layout in ImportProvider**
  Import `ImportProvider` and wrap the root routes inside [frontend/src/App.tsx](file:///d:/automatio+n/AniRec/frontend/src/App.tsx).
- [ ] **Step 5: Verify frontend builds successfully**
  Run: `npm run build` in `frontend`
  Expected: Built cleanly
- [ ] **Step 6: Commit changes**
  ```bash
  git add frontend/src/context/ImportContext.tsx frontend/src/services/ImportSyncService.ts frontend/src/App.tsx
  git commit -m "feat: implement frontend import context provider and sync agent"
  ```

---

### Task 6: Persistent Background Tasks Widget UI

**Files:**
- Create: `frontend/src/components/BackgroundTasksWidget.tsx`
- Modify: [frontend/src/App.tsx](file:///d:/automatio+n/AniRec/frontend/src/App.tsx)

**Interfaces:**
- Consumes: selectors from `ImportContext`.
- Produces: Persistently mounted collapsed/expanded slider widgets surviving route navigation.

- [ ] **Step 1: Create BackgroundTasksWidget component**
  Create [frontend/src/components/BackgroundTasksWidget.tsx](file:///d:/automatio+n/AniRec/frontend/src/components/BackgroundTasksWidget.tsx) implementing progress circles and task queue lists.
- [ ] **Step 2: Mount BackgroundTasksWidget in App.tsx layout root**
  Place `<BackgroundTasksWidget />` inside the root rendering node of [frontend/src/App.tsx](file:///d:/automatio+n/AniRec/frontend/src/App.tsx).
- [ ] **Step 3: Verify frontend compiles successfully**
  Run: `npm run build` in `frontend`
  Expected: Built cleanly
- [ ] **Step 4: Commit changes**
  ```bash
  git add frontend/src/components/BackgroundTasksWidget.tsx frontend/src/App.tsx
  git commit -m "feat: implement BackgroundTasksWidget in root App node"
  ```

---

### Task 7: Incremental Delta Merge & Completion Toasts

**Files:**
- Modify: [frontend/src/pages/MyListPage.tsx](file:///d:/automatio+n/AniRec/frontend/src/pages/MyListPage.tsx)

**Interfaces:**
- Consumes: `libraryRevision` and `pendingImportCount`.
- Produces: Floating delta-load banner and smooth entry merge animations.

- [x] **Step 1: Update library loading in MyListPage**
  Remove full list refreshes on imports.
- [x] **Step 2: Implement delta merging animation**
- [x] **Step 3: Verify frontend compiles successfully**
- [x] **Step 4: Commit all final changes**

---

### Task 8: Fix Status Mapping Pipeline & Redesign Background UX

**Files:**
- Modify: [backend/src/routes/import.ts](file:///d:/automatio+n/AniRec/backend/src/routes/import.ts)
- Modify: [backend/src/services/import/import.test.ts](file:///d:/automatio+n/AniRec/backend/src/services/import/import.test.ts)
- Modify: [frontend/src/pages/MyListPage.tsx](file:///d:/automatio+n/AniRec/frontend/src/pages/MyListPage.tsx)

**Interfaces:**
- Consumes: AniList JSON / MAL XML status fields, React Modal hooks.
- Produces: Normalized import status mappings, closable modal with "Continue in Background" controls.

- [ ] **Step 1: Implement robust `normalizeStatus` helper**
  Add a helper function in [backend/src/routes/import.ts](file:///d:/automatio+n/AniRec/backend/src/routes/import.ts) that checks and maps alternate values case-insensitively and resolves raw status numbers correctly.
- [ ] **Step 2: Update import background runners**
  Use `normalizeStatus` on list entries during XML and JSON processing, resolving double-resolution bugs where `'completed'` was mapped again and defaulted to `'planning'`.
- [ ] **Step 3: Add backend regression tests for status mappings**
  Update [backend/src/services/import/import.test.ts](file:///d:/automatio+n/AniRec/backend/src/services/import/import.test.ts) to verify that 'completed', 'watching', 'paused', 'dropped', and 'planning' statuses map to themselves and are preserved through the import pipeline.
- [ ] **Step 4: Update MyListPage import modal close controls**
  Modify [frontend/src/pages/MyListPage.tsx](file:///d:/automatio+n/AniRec/frontend/src/pages/MyListPage.tsx) to allow closing the modal when `importing` is true (by setting `showImport(false)`). Ensure that closing does not cancel the active background job.
- [ ] **Step 5: Add background guidance elements to import modal**
  Add a "Continue in Background" button and information label informing the user they can safely close the dialog.
- [ ] **Step 6: Run tests and verify builds**
  Validate that both backend tests pass and the frontend compiles successfully.

---

## Self-Review Check
1. **Spec Coverage**: All items (consolidated status, cursor delta sync, Background Tasks widget, checkpoints, adaptive polling, separate rate limit) are addressed in dedicated tasks.
2. **Placeholder Scan**: No vague statements or TODO comments are present.
3. **Type Consistency**: Signatures for `getLibraryDelta` and `getJobsStatus` match between backend routes and frontend utilities.
