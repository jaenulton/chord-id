import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Piano2D } from './components/Piano2D';
import { Piano3D } from './components/Piano3D';
import { ChordDisplay } from './components/ChordDisplay';
import { Settings, SettingsButton } from './components/Settings';
import { MessagesButton } from './components/MessagesButton';
import { InstrumentDock } from './components/InstrumentDock';
import { NewsTicker } from './components/NewsTicker';
import { ToastContainer } from './components/ToastNotification';
import { PollContainer } from './components/PollCard';
import { NotificationProvider } from './context/NotificationContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { useMidi } from './hooks/useMidi';
import { useAudio } from './hooks/useAudio';
import { useNotifications } from './hooks/useNotifications';
import { usePolls } from './hooks/usePolls';
import { getTheme } from './themes';
import { detectChord } from './utils/chordDetection';
import { DEFAULT_INSTRUMENT_ID, DEFAULT_VOLUME } from './audio/instruments';

// Hook for Electron auto-updates
function useElectronUpdates() {
  const [updateStatus, setUpdateStatus] = useState<{
    available: boolean;
    downloaded: boolean;
    version: string | null;
    progress: number;
  }>({
    available: false,
    downloaded: false,
    version: null,
    progress: 0,
  });

  useEffect(() => {
    // Only run in Electron environment
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateAvailable((info) => {
      setUpdateStatus(prev => ({
        ...prev,
        available: true,
        version: info.version,
      }));
    });

    window.electronAPI.onUpdateProgress((progress) => {
      setUpdateStatus(prev => ({
        ...prev,
        progress: progress.percent,
      }));
    });

    window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateStatus(prev => ({
        ...prev,
        downloaded: true,
        version: info.version,
      }));
    });
  }, []);

  const installUpdate = useCallback(() => {
    window.electronAPI?.installUpdate();
  }, []);

  return { ...updateStatus, installUpdate };
}

// Pull-to-refresh hook
function usePullToRefresh(threshold = 100) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        touchStartY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartY.current;

      if (diff > 0 && window.scrollY === 0) {
        // Apply resistance to make it feel natural
        const resistance = 0.4;
        setPullDistance(Math.min(diff * resistance, threshold * 1.5));

        // Prevent default scroll when pulling
        if (diff > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = () => {
      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(threshold);

        // Reload after a brief delay for visual feedback
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        setPullDistance(0);
      }
      isPulling.current = false;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, threshold, isRefreshing]);

  return { pullDistance, isRefreshing };
}

type VisualMode = '2d' | '3d';

interface AppSettings {
  themeId: string;
  visualMode: VisualMode;
  instrumentId: string;
  volume: number;
}

const STORAGE_KEY = 'chord-id-settings';

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore errors
  }
  return {
    themeId: 'midnight',
    visualMode: '2d',
    instrumentId: DEFAULT_INSTRUMENT_ID,
    volume: DEFAULT_VOLUME,
  };
}

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore errors
  }
}

// Component that initializes notification fetching
function NotificationFetcher() {
  // Fetch notifications from API every 30 seconds
  useNotifications({ pollInterval: 30000, enabled: true });
  return null;
}

function AppContent() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);

  // Electron auto-updates
  const updates = useElectronUpdates();

  // Get theme for ToastContainer
  const theme = useMemo(() => getTheme(settings.themeId), [settings.themeId]);

  // Detect mobile landscape mode
  useLayoutEffect(() => {
    const checkMobileLandscape = () => {
      const isMobile = window.innerWidth <= 768 || 'ontouchstart' in window;
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsMobileLandscape(isMobile && !isPortrait);
    };

    checkMobileLandscape();
    window.addEventListener('resize', checkMobileLandscape);
    window.addEventListener('orientationchange', checkMobileLandscape);

    return () => {
      window.removeEventListener('resize', checkMobileLandscape);
      window.removeEventListener('orientationchange', checkMobileLandscape);
    };
  }, []);

  // Pull-to-refresh
  const { pullDistance, isRefreshing } = usePullToRefresh(80);

  // Audio engine
  const audio = useAudio();

  // MIDI note callbacks for audio - use specific functions as deps to avoid infinite loops
  const onNoteOn = useCallback((note: number, velocity: number) => {
    audio.playNote(note, velocity);
  }, [audio.playNote]);

  const onNoteOff = useCallback((note: number) => {
    audio.stopNote(note);
  }, [audio.stopNote]);

  const midi = useMidi({ onNoteOn, onNoteOff });

  // Polls
  const { polls, vote: votePoll, dismissPoll } = usePolls();

  // Detect chord from active notes
  const detectedChord = useMemo(
    () => detectChord(midi.activeNotes),
    [midi.activeNotes]
  );

  // Save settings when they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const handleThemeChange = (themeId: string) => {
    setSettings(prev => ({ ...prev, themeId }));
  };

  const handleModeChange = (visualMode: VisualMode) => {
    setSettings(prev => ({ ...prev, visualMode }));
  };

  const handleInstrumentChange = async (instrumentId: string) => {
    setSettings(prev => ({ ...prev, instrumentId }));
    await audio.setInstrument(instrumentId);
  };

  const handleVolumeChange = (volume: number) => {
    setSettings(prev => ({ ...prev, volume }));
    audio.setVolume(volume);
  };

  // Sync audio settings when audio becomes enabled
  useEffect(() => {
    if (audio.isEnabled && settings.instrumentId !== audio.currentInstrumentId) {
      audio.setInstrument(settings.instrumentId);
    }
  }, [audio.isEnabled, settings.instrumentId, audio.currentInstrumentId, audio.setInstrument]);

  useEffect(() => {
    if (audio.isEnabled) {
      audio.setVolume(settings.volume);
    }
  }, [audio.isEnabled, settings.volume, audio.setVolume]);

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{
        background: `radial-gradient(ellipse at center top, ${theme.colors.surface} 0%, ${theme.colors.background} 50%)`,
      }}
    >
      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center z-50 pointer-events-none"
          style={{
            height: pullDistance,
            transition: pullDistance === 0 ? 'height 0.2s ease-out' : 'none',
          }}
        >
          <div
            className="flex items-center gap-2"
            style={{
              opacity: Math.min(pullDistance / 80, 1),
              transform: `scale(${Math.min(pullDistance / 80, 1)})`,
            }}
          >
            <svg
              className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`}
              style={{
                color: theme.colors.primary,
                transform: isRefreshing ? 'none' : `rotate(${Math.min(pullDistance * 3, 180)}deg)`,
              }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span
              className="text-sm font-medium"
              style={{ color: theme.colors.primary }}
            >
              {isRefreshing ? 'Refreshing...' : pullDistance >= 80 ? 'Release to refresh' : 'Pull to refresh'}
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 pt-4 pb-2">
        <div className="flex items-start justify-between">
          {/* Title on the left with 30px padding */}
          <motion.h1
            className="text-2xl font-bold tracking-tight"
            style={{
              color: theme.colors.primary,
              textShadow: `0 0 30px ${theme.colors.primaryGlow}60`,
              paddingLeft: '30px',
            }}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Chord-ID
          </motion.h1>

          {/* Centered news ticker container */}
          <div className="flex-1 flex justify-center">
            <NewsTicker theme={theme} />
          </div>

          {/* Spacer for settings button area (button is fixed positioned) */}
          <div style={{ width: '80px' }} />
        </div>
      </header>

      {/* Chord Display */}
      <ChordDisplay
        chord={detectedChord}
        theme={theme}
        activeNotes={midi.activeNotes}
      />

      {/* Piano Visualization */}
      <main className="flex-1 px-2 pb-2 pt-16 min-h-0">
        <motion.div
          className="h-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {settings.visualMode === '2d' ? (
            <Piano2D activeNotes={midi.activeNotes} theme={theme} />
          ) : (
            <Piano3D activeNotes={midi.activeNotes} theme={theme} />
          )}
        </motion.div>
      </main>

      {/* Instrument Dock - show when audio enabled, hide on mobile landscape */}
      {audio.isEnabled && !isMobileLandscape && (
        <InstrumentDock
          currentInstrumentId={audio.currentInstrumentId}
          onInstrumentChange={handleInstrumentChange}
          theme={theme}
          isLoading={audio.isLoading}
        />
      )}

      {/* Status Bar */}
      <footer className="px-4 py-2 flex items-center justify-center gap-4">
        {/* Step 1: Enable Audio (required for Web Audio API) */}
        {!audio.isEnabled ? (
          <motion.button
            onClick={audio.enable}
            disabled={audio.isLoading}
            className="px-6 py-2 rounded-full font-medium transition-all"
            style={{
              background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
              color: theme.colors.text,
              boxShadow: `0 0 20px ${theme.colors.primaryGlow}40`,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {audio.isLoading ? 'Loading...' : 'Enable Audio'}
          </motion.button>
        ) : !midi.isEnabled ? (
          /* Step 2: Connect MIDI */
          <motion.button
            onClick={midi.connect}
            disabled={midi.isConnecting}
            className="px-6 py-2 rounded-full font-medium transition-all"
            style={{
              background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
              color: theme.colors.text,
              boxShadow: `0 0 20px ${theme.colors.primaryGlow}40`,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {midi.isConnecting ? 'Connecting...' : 'Connect MIDI'}
          </motion.button>
        ) : (
          /* Connected state */
          <div className="flex items-center gap-3 text-sm" style={{ color: theme.colors.textMuted }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>{midi.selectedInput?.name || 'No device'}</span>
            </div>
            <span className="opacity-50">|</span>
            <span>{midi.activeNotes.size} notes active</span>
          </div>
        )}
      </footer>

      {/* Error Display */}
      {(midi.error || audio.error) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm"
        >
          {midi.error || audio.error}
        </motion.div>
      )}

      {/* Messages Button (to the left of Settings) */}
      <MessagesButton theme={theme} />

      {/* Settings Button */}
      <SettingsButton onClick={() => setIsSettingsOpen(true)} theme={theme} />

      {/* Settings Panel */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTheme={theme}
        onThemeChange={handleThemeChange}
        visualMode={settings.visualMode}
        onModeChange={handleModeChange}
        midiInputs={midi.inputs.map(i => ({ id: i.id, name: i.name }))}
        selectedMidiInput={midi.selectedInput?.id || null}
        onMidiInputChange={midi.selectInput}
        isMidiConnected={midi.isEnabled}
        onMidiConnect={midi.connect}
        isAudioEnabled={audio.isEnabled}
        isAudioLoading={audio.isLoading}
        currentInstrumentId={audio.currentInstrumentId}
        onInstrumentChange={handleInstrumentChange}
        volume={settings.volume}
        onVolumeChange={handleVolumeChange}
      />

      {/* Update notification banner (Electron only) */}
      <AnimatePresence>
        {updates.downloaded && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${theme.colors.surface} 0%, ${theme.colors.background} 100%)`,
              border: `1px solid ${theme.colors.primary}40`,
              boxShadow: `0 0 30px ${theme.colors.primaryGlow}30`,
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: theme.colors.primary }}
              />
              <span style={{ color: theme.colors.text }}>
                Update v{updates.version} ready!
              </span>
            </div>
            <button
              onClick={updates.installUpdate}
              className="px-3 py-1 rounded-lg font-medium text-sm transition-all hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
                color: '#fff',
              }}
            >
              Restart
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Polls - displayed on left side */}
      <PollContainer
        polls={polls}
        theme={theme}
        onVote={votePoll}
        onDismiss={dismissPoll}
      />

      {/* Toast Notifications */}
      <ToastContainer theme={theme} position="top-right" maxVisible={5} />

      {/* Background notification fetcher */}
      <NotificationFetcher />
    </div>
  );
}

// Main App component wrapped with providers
function App() {
  return (
    <WebSocketProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </WebSocketProvider>
  );
}

export default App;
