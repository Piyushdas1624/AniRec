import type { Database } from 'better-sqlite3';
import { initializeDatabase } from './initDb';

const db: Database = initializeDatabase();

export default db;
