/**
 * Data contracts and messaging protocols for chrome-rag-knowledge-base-extension
 * Derived from Section 7 of docs/SPECIFICATION.md
 */

// Store 1: 'articles' (Lightweight metadata for fast feeds, filters & badges)
// Indexes: 'by_url' (unique), 'by_siteName', 'by_savedAt', 'by_isStarred'
export interface ArticleRecord {
  /** SHA-256 hash of canonical URL */
  id: string;
  /** Canonical page URL */
  url: string;
  /** Extracted article title */
  title: string;
  /** Author / publication */
  byline?: string;
  /** Leading summary (~200 chars) */
  excerpt: string;
  /** Domain name (e.g., "go.dev") */
  siteName: string;
  /** Page favicon URL */
  faviconUrl?: string;
  /** Epoch timestamp (ms) */
  savedAt: number;
  /** Epoch timestamp (ms) of last re-index */
  updatedAt: number;
  /** Estimated reading time */
  readingTimeMinutes: number;
  /** Pinned status (protected from bulk cleanup) */
  isStarred: boolean;
  /** Async ingestion lifecycle state */
  status: 'indexing' | 'indexed' | 'failed';
}

// Store 2: 'article_contents' (1:1 vertical partition for heavy full text & export)
// KeyPath: 'articleId'
export interface ArticleContentRecord {
  /** Foreign key -> ArticleRecord.id */
  articleId: string;
  /** Clean plain text from Readability */
  contentText: string;
  /** Clean Markdown for .zip export & reader view */
  contentMarkdown: string;
}

// Store 3: 'chunks' (1:N child chunks + binary vector embeddings)
// KeyPath: 'id' | Index: 'by_articleId'
export interface ChunkRecord {
  /** Format: `${articleId}_chunk_${chunkIndex}` */
  id: string;
  /** Foreign key -> ArticleRecord.id */
  articleId: string;
  /** 0-indexed sequential order */
  chunkIndex: number;
  /** ~150-180 word passage */
  text: string;
  /** 384-dimensional normalized binary vector (1,536 bytes) */
  vector: Float32Array;
}

// Settings stored in chrome.storage.local
export interface StorageSettings {
  /** Quota cap in bytes. Default: 50 * 1024 * 1024 (50 MB) */
  maxStorageBytes: number;
  /** Ratio at which to trigger storage warning. Default: 0.85 */
  warnThresholdRatio: number;
  /** True once user explicitly raises the storage cap */
  hasGrantedDiskExpansion: boolean;
}

export const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  maxStorageBytes: 50 * 1024 * 1024, // 50 MB
  warnThresholdRatio: 0.85,
  hasGrantedDiskExpansion: false,
};

// Storage Quota Status returned by checkStorageQuota()
export interface StorageQuotaStatus {
  /** Current storage usage in bytes from navigator.storage.estimate() */
  currentUsageBytes: number;
  /** User-configured storage cap in bytes */
  maxStorageBytes: number;
  /** Origin pool quota granted by browser in bytes */
  browserQuotaBytes: number;
  /** Estimated remaining physical disk storage in bytes */
  freePhysicalDiskBytes: number;
  /** Ratio of current usage to user cap (currentUsageBytes / maxStorageBytes) */
  usageRatio: number;
  /** True when usage ratio is at or above warnThresholdRatio (default 85%) */
  isWarning: boolean;
  /** True when current usage + requested payload exceeds maxStorageBytes */
  isExceeded: boolean;
  /** True when remaining physical disk space is under 500 MB */
  isLowPhysicalDisk: boolean;
  /** True when both quota is not exceeded and physical disk is not low */
  canSave: boolean;
  /** Suggested new cap when expanding storage (e.g. 250 MB or 2x current cap) */
  suggestedNewCapBytes: number;
}

// Internal IPC Messaging Protocol (chrome.runtime.sendMessage)
export type ExtensionMessage =
  | { type: 'SAVE_ACTIVE_TAB' }
  | { type: 'EXTRACT_PAGE' }
  | {
      type: 'INDEX_PAGE_DATA';
      payload: {
        article: Omit<ArticleRecord, 'status'>;
        content: Omit<ArticleContentRecord, 'articleId'>;
        textChunks: string[];
      };
    }
  | {
      type: 'STORAGE_QUOTA_EXCEEDED';
      payload: {
        currentUsageBytes: number;
        maxStorageBytes: number;
        requiredBytes: number;
        suggestedNewCapBytes: number; // e.g., 250 * 1024 * 1024 (250 MB)
      };
    }
  | { type: 'UPDATE_STORAGE_CAP'; payload: { newMaxStorageBytes: number } }
  | {
      type: 'GENERATE_EMBEDDINGS_JOB';
      /** Routing: only the offscreen document handles this message. */
      target: 'offscreen';
      payload: { articleId: string; textChunks: string[] };
    }
  | { type: 'ARTICLE_INDEXED'; payload: { articleId: string; url: string } }
  | {
      type: 'SEARCH_QUERY';
      /** Routing: only the offscreen document handles this message. */
      target: 'offscreen';
      payload: {
        query: string;
        topK?: number;
        domainFilter?: string;
        starredOnly?: boolean;
      };
    }
  | {
      type: 'SEARCH_RESULTS';
      payload: {
        results: Array<{
          article: ArticleRecord;
          bestSnippet: string;
          chunkIndex: number;
          score: number;
        }>;
      };
    }
  | {
      type: 'FIND_RELATED_ARTICLES';
      payload: { text: string; excludeArticleId?: string; topK?: number };
    }
  | { type: 'SCROLL_AND_HIGHLIGHT'; payload: { snippet: string } }
  | { type: 'DELETE_ARTICLES'; payload: { articleIds: string[] } }
  | { type: 'CHECK_TAB_STATUS'; payload: { url: string } };

export interface TabStatusResponse {
  isSaved: boolean;
  article?: ArticleRecord;
}

// Content script extraction result (response to EXTRACT_PAGE)
export type ExtractPageErrorCode =
  'BLOCKED_URL' | 'NOT_READABLE' | 'TOO_SHORT' | 'EXTRACTION_FAILED';

export type ExtractPageResponse =
  | {
      ok: true;
      canonicalUrl: string;
      title: string;
      byline?: string;
      siteName: string;
      excerpt: string;
      textContent: string;
      markdown: string;
      wordCount: number;
      readingTimeMinutes: number;
      chunks: Array<{ chunkIndex: number; text: string }>;
    }
  | { ok: false; error: ExtractPageErrorCode; reason?: string };
