import { useCallback, useEffect, useState } from 'react';
import { checkStorageQuota, updateStorageCap } from '../db';
import type { ExtensionMessage, StorageQuotaStatus } from '../types/messages';

export interface UseStorageQuotaReturn {
  quotaStatus: StorageQuotaStatus | null;
  refreshQuota: () => Promise<StorageQuotaStatus | null>;
  updateCap: (newCapBytes: number) => Promise<void>;
  isLoading: boolean;
}

/**
 * Shared custom hook for tracking and updating the user-controlled storage quota.
 */
export function useStorageQuota(): UseStorageQuotaReturn {
  const [quotaStatus, setQuotaStatus] = useState<StorageQuotaStatus | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshQuota =
    useCallback(async (): Promise<StorageQuotaStatus | null> => {
      try {
        const status = await checkStorageQuota();
        setQuotaStatus(status);
        return status;
      } catch (err) {
        console.error('[useStorageQuota] Failed to check quota:', err);
        return null;
      } finally {
        setIsLoading(false);
      }
    }, []);

  const updateCap = useCallback(
    async (newCapBytes: number): Promise<void> => {
      await updateStorageCap(newCapBytes);
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime
          .sendMessage({
            type: 'DATABASE_UPDATED',
            payload: { reason: 'cap_updated' },
          } satisfies ExtensionMessage)
          .catch(() => {});
      }
      await refreshQuota();
    },
    [refreshQuota],
  );

  useEffect(() => {
    void Promise.resolve().then(() => refreshQuota());

    const handleRuntimeMessage = (message: ExtensionMessage) => {
      if (
        message.type === 'ARTICLE_INDEXED' ||
        message.type === 'DATABASE_UPDATED'
      ) {
        void refreshQuota();
      }
    };

    const handleStorageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (
        areaName === 'local' &&
        (changes.storageSettings || changes.maxStorageBytes)
      ) {
        void refreshQuota();
      }
    };

    if (typeof chrome !== 'undefined') {
      chrome.runtime?.onMessage?.addListener(handleRuntimeMessage);
      chrome.storage?.onChanged?.addListener(handleStorageChanged);
    }

    return () => {
      if (typeof chrome !== 'undefined') {
        chrome.runtime?.onMessage?.removeListener(handleRuntimeMessage);
        chrome.storage?.onChanged?.removeListener(handleStorageChanged);
      }
    };
  }, [refreshQuota]);

  return {
    quotaStatus,
    refreshQuota,
    updateCap,
    isLoading,
  };
}
