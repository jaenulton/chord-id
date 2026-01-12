import { useState, useEffect, useCallback } from 'react';
import { useWebSocketContext, WebSocketMessage } from '../context/WebSocketContext';

export interface ContentData {
  ticker: string;
  banner: {
    imageUrl: string;
    linkUrl: string;
  };
}

interface UseContentReturn {
  data: ContentData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isConnected: boolean;
}

// Use absolute URL for Electron app (file:// protocol), relative for web
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
const BASE_URL = isElectron ? 'https://chord-id.jaes.online' : '';
const CACHE_KEY = 'chord-id-content-cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const FALLBACK_POLL_INTERVAL = 60 * 1000; // Fallback poll every 60 seconds if WS disconnected

interface CachedContent {
  data: ContentData;
  timestamp: number;
}

function getCachedContent(): ContentData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: CachedContent = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_DURATION) {
        return parsed.data;
      }
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

function setCachedContent(data: ContentData): void {
  try {
    const cacheEntry: CachedContent = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
  } catch {
    // Ignore cache errors
  }
}

// Helper to normalize image URL
function normalizeImageUrl(imageUrl: string): string {
  if (imageUrl && !imageUrl.startsWith('http') && BASE_URL) {
    return `${BASE_URL}/${imageUrl}`;
  }
  return imageUrl;
}

export function useContent(): UseContentReturn {
  const [data, setData] = useState<ContentData | null>(() => getCachedContent());
  const [isLoading, setIsLoading] = useState(!getCachedContent());
  const [error, setError] = useState<string | null>(null);

  // Get WebSocket context for real-time updates
  const { isConnected, subscribe } = useWebSocketContext();

  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Try multiple endpoints
      const endpoints = [`${BASE_URL}/content.json`, `${BASE_URL}/api/content.json`];
      let response: Response | null = null;

      for (const endpoint of endpoints) {
        try {
          response = await fetch(endpoint);
          if (response.ok) break;
        } catch {
          continue;
        }
      }

      if (!response || !response.ok) {
        throw new Error('Failed to fetch content');
      }

      // Parse and normalize the response
      const rawData = await response.json();

      const contentData: ContentData = {
        ticker: rawData.ticker || 'Welcome to Chord-ID!',
        banner: {
          imageUrl: normalizeImageUrl(rawData.banner?.imageUrl || rawData.banner?.image || ''),
          linkUrl: rawData.banner?.linkUrl || rawData.banner?.url || '',
        },
      };

      setData(contentData);
      setCachedContent(contentData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch content';
      console.error('Failed to fetch content:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Subscribe to WebSocket content updates
  useEffect(() => {
    const unsubscribe = subscribe('content_update', (message: WebSocketMessage) => {
      console.log('[Content] Received WebSocket update:', message);

      const wsData = message.data as { ticker?: string; banner?: { image?: string; url?: string } };

      if (wsData) {
        const contentData: ContentData = {
          ticker: wsData.ticker || data?.ticker || 'Welcome to Chord-ID!',
          banner: {
            imageUrl: normalizeImageUrl(wsData.banner?.image || data?.banner.imageUrl || ''),
            linkUrl: wsData.banner?.url || data?.banner.linkUrl || '',
          },
        };

        setData(contentData);
        setCachedContent(contentData);
        console.log('[Content] Updated via WebSocket');
      }
    });

    return unsubscribe;
  }, [subscribe, data]);

  // Initial fetch and fallback polling
  useEffect(() => {
    // If we have cached data, still fetch in background to refresh
    const cachedData = getCachedContent();
    if (cachedData) {
      setData(cachedData);
      setIsLoading(false);
      // Background refresh
      fetchContent();
    } else {
      fetchContent();
    }

    // Fallback polling only when WebSocket is disconnected
    const pollInterval = setInterval(() => {
      if (!isConnected) {
        console.log('[Content] WebSocket disconnected, polling...');
        fetchContent();
      }
    }, FALLBACK_POLL_INTERVAL);

    return () => {
      clearInterval(pollInterval);
    };
  }, [fetchContent, isConnected]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchContent,
    isConnected,
  };
}
