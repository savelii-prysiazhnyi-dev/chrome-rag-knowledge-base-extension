/**
 * Formatting utilities for dates, numbers, and bytes.
 */

export function formatBytesToMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function formatShortDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function formatDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function todayDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
