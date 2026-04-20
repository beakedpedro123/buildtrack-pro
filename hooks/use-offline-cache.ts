/**
 * useOfflineCache — Wraps tRPC query data with automatic AsyncStorage caching.
 *
 * Pattern: stale-while-revalidate
 * 1. On mount, load cached data from AsyncStorage immediately
 * 2. When server data arrives, update cache and return fresh data
 * 3. If offline, cached data is shown seamlessly
 *
 * Usage:
 *   const { data, isLoading } = useOfflineCache(
 *     CACHE_KEYS.MESSAGES,
 *     trpcQueryResult.data,
 *     trpcQueryResult.isLoading
 *   );
 */
import { useEffect, useRef, useState } from "react";
import { getCached, setCache } from "@/lib/data-cache";

export function useOfflineCache<T>(
  cacheKey: string,
  serverData: T | undefined,
  isServerLoading: boolean,
): { data: T | undefined; isLoading: boolean } {
  const [cachedData, setCachedData] = useState<T | undefined>(undefined);
  const loadedFromCache = useRef(false);

  // Load from cache on mount
  useEffect(() => {
    if (!loadedFromCache.current) {
      loadedFromCache.current = true;
      getCached<T>(cacheKey).then((cached) => {
        if (cached !== null) {
          setCachedData(cached);
        }
      });
    }
  }, [cacheKey]);

  // When server data arrives, update cache
  useEffect(() => {
    if (serverData !== undefined && serverData !== null) {
      // Don't cache empty arrays as they might be loading states
      if (Array.isArray(serverData) && serverData.length === 0 && isServerLoading) return;
      setCache(cacheKey, serverData).catch(() => {});
      setCachedData(serverData);
    }
  }, [serverData, cacheKey, isServerLoading]);

  // Return server data if available, otherwise cached data
  const data = serverData ?? cachedData;
  const isLoading = isServerLoading && cachedData === undefined;

  return { data, isLoading };
}
