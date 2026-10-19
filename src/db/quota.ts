import {
  DEFAULT_STORAGE_SETTINGS,
  type StorageSettings,
  type StorageQuotaStatus,
  type ArticleRecord,
  type ArticleContentRecord,
} from '../types/messages';

export const LOW_PHYSICAL_DISK_BYTES = 500 * 1024 * 1024; // 500 MB
export const DEFAULT_SUGGESTED_EXPANSION_BYTES = 250 * 1024 * 1024; // 250 MB

const STORAGE_KEY = 'storageSettings';
let inMemorySettings: StorageSettings | null = null;

/**
 * Retrieves the current storage settings from chrome.storage.local,
 * with a fallback to in-memory state or defaults when running outside the Chrome extension runtime.
 */
export async function getStorageSettings(): Promise<StorageSettings> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      if (data && data[STORAGE_KEY]) {
        return {
          ...DEFAULT_STORAGE_SETTINGS,
          ...(data[STORAGE_KEY] as Partial<StorageSettings>),
        };
      }
    } catch (err) {
      console.warn(
        '[Second Brain Quota] Error reading from chrome.storage.local:',
        err,
      );
    }
  }

  if (inMemorySettings) {
    return { ...inMemorySettings };
  }

  return { ...DEFAULT_STORAGE_SETTINGS };
}

/**
 * Updates the user-configured storage cap in bytes and marks hasGrantedDiskExpansion as true.
 */
export async function updateStorageCap(
  newMaxStorageBytes: number,
): Promise<StorageSettings> {
  const current = await getStorageSettings();
  const updated: StorageSettings = {
    ...current,
    maxStorageBytes: newMaxStorageBytes,
    hasGrantedDiskExpansion: true,
  };

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    } catch (err) {
      console.warn(
        '[Second Brain Quota] Error saving to chrome.storage.local:',
        err,
      );
    }
  }

  inMemorySettings = { ...updated };
  return updated;
}

/**
 * Resets in-memory storage settings back to default. For testing purposes.
 */
export function resetStorageSettingsForTesting(): void {
  inMemorySettings = null;
}

/**
 * Accurately estimates the total serialized byte footprint of an article,
 * its vertically partitioned content record, and its chunks (including 1,536-byte Float32Array binary vectors).
 */
export function estimatePayloadBytes(
  article: Omit<ArticleRecord, 'status'>,
  content: Omit<ArticleContentRecord, 'articleId'>,
  textChunks: string[],
): number {
  const encoder = new TextEncoder();
  let bytes = 0;

  // Metadata record string fields
  bytes += encoder.encode(article.id || '').length;
  bytes += encoder.encode(article.url || '').length;
  bytes += encoder.encode(article.title || '').length;
  bytes += encoder.encode(article.byline || '').length;
  bytes += encoder.encode(article.excerpt || '').length;
  bytes += encoder.encode(article.siteName || '').length;
  bytes += encoder.encode(article.faviconUrl || '').length;
  // Metadata primitive overhead (timestamps, readingTime, boolean, status, B-tree indexes)
  bytes += 128;

  // Vertically partitioned content (plain text + clean Markdown)
  bytes += encoder.encode(content.contentText || '').length;
  bytes += encoder.encode(content.contentMarkdown || '').length;
  bytes += 64; // Content record framing overhead

  // Chunks: text passage + binary Float32Array(384) [384 * 4 = 1,536 bytes] + ID/metadata overhead
  const VECTOR_BYTES_PER_CHUNK = 384 * 4; // 1,536 bytes
  const CHUNK_RECORD_OVERHEAD = 128; // id string, articleId, chunkIndex, IndexedDB object overhead
  for (const chunk of textChunks) {
    bytes += encoder.encode(chunk).length;
    bytes += VECTOR_BYTES_PER_CHUNK;
    bytes += CHUNK_RECORD_OVERHEAD;
  }

  return bytes;
}

/**
 * Evaluates the two-layer storage quota against navigator.storage.estimate() and user settings.
 */
export async function checkStorageQuota(
  requiredBytes = 0,
): Promise<StorageQuotaStatus> {
  const settings = await getStorageSettings();
  let currentUsageBytes = 0;
  // Default to 10 GB pool quota fallback when navigator.storage is unmocked or missing
  let browserQuotaBytes = 10 * 1024 * 1024 * 1024;

  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      currentUsageBytes = estimate.usage ?? 0;
      if (estimate.quota !== undefined) {
        browserQuotaBytes = estimate.quota;
      }
    } catch (err) {
      console.warn(
        '[Second Brain Quota] navigator.storage.estimate failed:',
        err,
      );
    }
  }

  const freePhysicalDiskBytes = Math.max(
    0,
    browserQuotaBytes - currentUsageBytes,
  );
  const maxStorageBytes = settings.maxStorageBytes;
  const usageRatio =
    maxStorageBytes > 0 ? currentUsageBytes / maxStorageBytes : 1;
  const isWarning = usageRatio >= settings.warnThresholdRatio;
  const isExceeded = currentUsageBytes + requiredBytes > maxStorageBytes;
  const isLowPhysicalDisk = freePhysicalDiskBytes < LOW_PHYSICAL_DISK_BYTES;
  const canSave = !isExceeded && !isLowPhysicalDisk;
  const suggestedNewCapBytes = Math.max(
    DEFAULT_SUGGESTED_EXPANSION_BYTES,
    maxStorageBytes * 2,
  );

  return {
    currentUsageBytes,
    maxStorageBytes,
    browserQuotaBytes,
    freePhysicalDiskBytes,
    usageRatio,
    isWarning,
    isExceeded,
    isLowPhysicalDisk,
    canSave,
    suggestedNewCapBytes,
  };
}
