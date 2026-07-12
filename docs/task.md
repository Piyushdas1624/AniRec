# Background Tasks Subsystem & Activity Center Tasks Checklist

- [x] **Task 1: Rate Limiting & DB Schema Alterations**
  - [x] Create `library_state` table in `backend/src/utils/initDb.ts`
  - [x] Create `library_sync_log` table in `backend/src/utils/initDb.ts`
  - [x] Set up separate rate limiters for status endpoints in `backend/src/index.ts`
  - [x] Write and pass database schema unit test `backend/src/tests/db.test.ts`
  - [x] Run production build (`tsc`) and verify backend compiles successfully
  - [x] Commit Task 1 changes to git repository

- [x] **Task 2: Services Import Module Setup & Typing**
  - [x] Implement `types.ts`
  - [x] Implement `repository.ts`
  - [x] Implement `scheduler.ts`
  - [x] Implement `manager.ts`
  - [x] Implement `index.ts` (dependency injection entrypoint)
  - [x] Write unit tests and verify success

- [x] **Task 3: Decoupled Resolvers & Batch DB Flusher**
  - [x] Implement `resolver.ts`
  - [x] Implement `database.ts`
  - [x] Refactor `backend/src/routes/import.ts` endpoints
  - [x] Write unit tests and verify success

- [x] **Task 4: Library Delta Pagination Sync & Graceful Shutdowns**
  - [x] Implement delta sync endpoint in `backend/src/routes/anime.ts`
  - [x] Update API client in `frontend/src/utils/api.ts`
  - [x] Implement process lifecycle exits in `backend/src/index.ts`
  - [x] Write integration test and verify success

- [x] **Task 5: Frontend Context Provider & Transport Sync**
  - [x] Create `Transport` interface and `PollingTransport`
  - [x] Implement `ImportSyncService` with adaptive polling
  - [x] Implement `ImportProvider` context container
  - [x] Wrap `App.tsx` layout in `ImportProvider`

- [x] **Task 6: Persistent Background Tasks Widget UI**
  - [x] Create `BackgroundTasksWidget` component
  - [x] Mount widget in root `App.tsx` layout
  - [x] Verify frontend compiles successfully

- [x] **Task 7: Incremental Delta Merge & Completion Toasts**
  - [x] Update library loading in `MyListPage.tsx`
  - [x] Implement delta merging animation and toast notifications
  - [x] Verify frontend compiles successfully

- [x] **Operational Polish: Visibility-Aware Polling**
  - [x] Implement pause/resume/forcePoll lifecycle methods on PollingTransport
  - [x] Wire browser lifecycle events (visibilitychange, online/offline, focus) in ImportProvider
  - [x] Verify frontend builds successfully

- [x] **Task 8: Fix Status Mapping Pipeline & Redesign Background UX**
  - [x] Implement case-insensitive `normalizeStatus` helper on backend
  - [x] Update MAL XML and AniList JSON runners to use `normalizeStatus`
  - [x] Write unit tests for all status mappings and verify they pass
  - [x] Update frontend import modal close rules and add background buttons
  - [x] Start application and manually verify background flows and status mappings in Chrome
  - [x] Verify frontend and backend build cleanly with zero errors
