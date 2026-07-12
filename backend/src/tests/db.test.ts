import test from 'node:test';
import assert from 'assert';
import db from '../utils/db';

test('Database has library_state and library_sync_log tables', () => {
    const stateTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='library_state'").get() as any;
    assert.ok(stateTable, 'library_state table should exist');
    
    const syncTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='library_sync_log'").get() as any;
    assert.ok(syncTable, 'library_sync_log table should exist');
    
    const syncCols = db.prepare("PRAGMA table_info(library_sync_log)").all() as any[];
    const hasSeq = syncCols.some(col => col.name === 'sequence' && col.pk === 1);
    assert.ok(hasSeq, 'library_sync_log should have a primary key sequence column');
});
