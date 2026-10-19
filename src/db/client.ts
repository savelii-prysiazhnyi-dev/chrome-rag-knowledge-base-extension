import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type SecondBrainDB } from './schema';

let dbPromise: Promise<IDBPDatabase<SecondBrainDB>> | null = null;

/**
 * Returns the singleton IndexedDB connection instance for the Second Brain database.
 */
export function getDB(): Promise<IDBPDatabase<SecondBrainDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SecondBrainDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Store 1: 'articles' (Lightweight metadata for fast feeds, filters & badges)
        if (!db.objectStoreNames.contains('articles')) {
          const articlesStore = db.createObjectStore('articles', {
            keyPath: 'id',
          });
          articlesStore.createIndex('by_url', 'url', { unique: true });
          articlesStore.createIndex('by_siteName', 'siteName', {
            unique: false,
          });
          articlesStore.createIndex('by_savedAt', 'savedAt', { unique: false });
          articlesStore.createIndex('by_isStarred', 'isStarred', {
            unique: false,
          });
        }

        // Store 2: 'article_contents' (1:1 vertical partition for heavy full text & export)
        if (!db.objectStoreNames.contains('article_contents')) {
          db.createObjectStore('article_contents', {
            keyPath: 'articleId',
          });
        }

        // Store 3: 'chunks' (1:N child chunks + binary vector embeddings)
        if (!db.objectStoreNames.contains('chunks')) {
          const chunksStore = db.createObjectStore('chunks', {
            keyPath: 'id',
          });
          chunksStore.createIndex('by_articleId', 'articleId', {
            unique: false,
          });
        }
      },
      blocked() {
        console.warn(
          '[Second Brain DB] Upgrade blocked: another tab is holding open an older DB connection.',
        );
      },
      blocking() {
        console.warn(
          '[Second Brain DB] Connection is blocking a version change; closing.',
        );
        void closeDB();
      },
      terminated() {
        console.warn(
          '[Second Brain DB] IndexedDB connection terminated unexpectedly.',
        );
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/**
 * Closes the active database connection if open and resets the singleton promise.
 */
export async function closeDB(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // Ignore errors when closing
    } finally {
      dbPromise = null;
    }
  }
}

/**
 * Closes the active connection and deletes the underlying database. Useful for test teardowns.
 */
export async function resetDB(): Promise<void> {
  await closeDB();
  await deleteDB(DB_NAME);
}
