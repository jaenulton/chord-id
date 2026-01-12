import { useState, useEffect, useCallback } from 'react';
import { useWebSocketContext, WebSocketMessage } from '../context/WebSocketContext';

export interface Poll {
  id: number;
  question: string;
  options: string[];
  vote_counts: number[];
  total_votes: number;
  user_voted: boolean;
  user_vote_index: number | null;
  expires_at: string | null;
  is_active: boolean;
}

interface PollsResponse {
  polls: Poll[];
}

// Use absolute URL for Electron app (file:// protocol), relative for web
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
const BASE_URL = isElectron ? 'https://chord-id.jaes.online' : '';
const POLL_ENDPOINT = `${BASE_URL}/api/polls.php`;
const FALLBACK_POLL_INTERVAL = 120 * 1000; // Fallback poll every 2 minutes if WS disconnected
const VISITOR_ID_KEY = 'chord-id-visitor-id';

/**
 * Get or generate a visitor ID for tracking votes/dismissals
 * This persists across sessions in localStorage
 */
function getVisitorId(): string {
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);

  if (!visitorId) {
    // Generate a UUID v4
    visitorId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }

  return visitorId;
}

export function usePolls() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visitorId] = useState(() => getVisitorId());

  // Get WebSocket context for real-time updates
  const { isConnected, subscribe } = useWebSocketContext();

  const fetchPolls = useCallback(async () => {
    try {
      // Include visitor_id in the request to get personalized poll status
      const url = new URL(POLL_ENDPOINT, window.location.origin);
      url.searchParams.set('visitor_id', visitorId);

      const response = await fetch(url.toString(), {
        credentials: 'include', // Include cookies
      });

      if (!response.ok) {
        // No polls available or server error - not necessarily an error state
        if (response.status === 404) {
          setPolls([]);
          setError(null);
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data: PollsResponse = await response.json();

      // Server already filters out dismissed polls and includes user vote status
      const activePolls = (data.polls || []).filter(p => p.is_active);

      setPolls(activePolls);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch polls:', err);
      // Don't show error for network issues - just keep existing polls
      if (polls.length === 0) {
        setError(err instanceof Error ? err.message : 'Failed to fetch polls');
      }
    } finally {
      setIsLoading(false);
    }
  }, [visitorId, polls.length]);

  /**
   * Submit a vote for a poll option
   */
  const vote = useCallback(async (pollId: number, optionIndex: number): Promise<boolean> => {
    try {
      const response = await fetch(POLL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          poll_id: pollId,
          option_index: optionIndex,
          visitor_id: visitorId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Vote failed:', errorData.error || response.status);
        return false;
      }

      const data = await response.json();

      if (data.success && data.poll) {
        // Update local state with the returned poll data from server
        setPolls(prev => prev.map(p =>
          p.id === pollId
            ? {
                ...data.poll,
                user_voted: true,
                user_vote_index: optionIndex,
              }
            : p
        ));
        return true;
      }

      return false;
    } catch (err) {
      console.error('Vote request failed:', err);
      return false;
    }
  }, [visitorId]);

  /**
   * Dismiss a poll (persisted to server)
   * The poll will be hidden and won't show again for this visitor
   */
  const dismissPoll = useCallback(async (pollId: number): Promise<boolean> => {
    // Optimistically remove from UI immediately
    setPolls(prev => prev.filter(p => p.id !== pollId));

    try {
      const response = await fetch(POLL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          poll_id: pollId,
          action: 'dismiss',
          visitor_id: visitorId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Dismiss failed:', errorData.error || response.status);
        // Don't restore the poll on failure - it's already hidden
        return false;
      }

      const data = await response.json();
      return data.success === true;
    } catch (err) {
      console.error('Dismiss request failed:', err);
      // Don't restore the poll on network error - keep it hidden
      return false;
    }
  }, [visitorId]);

  // Subscribe to WebSocket poll updates
  useEffect(() => {
    const unsubscribe = subscribe('poll_update', (message: WebSocketMessage) => {
      console.log('[Polls] Received WebSocket update:', message);

      const wsPoll = message.data as Poll | undefined;
      const action = message.action;

      if (action === 'created' && wsPoll) {
        // Add new poll if it's active
        if (wsPoll.is_active) {
          setPolls(prev => {
            // Check if poll already exists
            if (prev.some(p => p.id === wsPoll.id)) {
              return prev;
            }
            return [{ ...wsPoll, user_voted: false, user_vote_index: null }, ...prev];
          });
        }
        console.log('[Polls] Added new poll via WebSocket');
      } else if (action === 'updated' && wsPoll) {
        // Update existing poll
        setPolls(prev => prev.map(p =>
          p.id === wsPoll.id
            ? { ...wsPoll, user_voted: p.user_voted, user_vote_index: p.user_vote_index }
            : p
        ).filter(p => p.is_active));
        console.log('[Polls] Updated poll via WebSocket');
      } else if (action === 'deleted' && wsPoll) {
        // Remove deleted poll
        setPolls(prev => prev.filter(p => p.id !== wsPoll.id));
        console.log('[Polls] Removed poll via WebSocket');
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // Initial fetch and fallback polling
  useEffect(() => {
    fetchPolls();

    // Fallback polling only when WebSocket is disconnected
    const interval = setInterval(() => {
      if (!isConnected) {
        console.log('[Polls] WebSocket disconnected, polling...');
        fetchPolls();
      }
    }, FALLBACK_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchPolls, isConnected]);

  return {
    polls,
    isLoading,
    error,
    vote,
    dismissPoll,
    refetch: fetchPolls,
    visitorId,
    isConnected,
  };
}
