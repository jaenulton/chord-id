import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Theme } from '../themes';
import { instruments } from '../audio/instruments';

interface InstrumentDockProps {
  currentInstrumentId: string;
  onInstrumentChange: (instrumentId: string) => void;
  theme: Theme;
  isLoading: boolean;
}

// Instrument graphics - more visual icons
const instrumentGraphics: Record<string, { icon: string; gradient: string }> = {
  'grand-piano': {
    icon: '🎹',
    gradient: 'linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%)',
  },
  'electric-piano': {
    icon: '🎹',
    gradient: 'linear-gradient(135deg, #c9a227 0%, #8b6914 100%)',
  },
  'strings': {
    icon: '🎻',
    gradient: 'linear-gradient(135deg, #8b4513 0%, #5c2d0e 100%)',
  },
  'organ': {
    icon: '🎛️',
    gradient: 'linear-gradient(135deg, #4a0e0e 0%, #2d0808 100%)',
  },
  'synth-pad': {
    icon: '🌊',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%)',
  },
  'synth-lead': {
    icon: '⚡',
    gradient: 'linear-gradient(135deg, #6b21a8 0%, #3b0764 100%)',
  },
};

export function InstrumentDock({
  currentInstrumentId,
  onInstrumentChange,
  theme,
  isLoading,
}: InstrumentDockProps) {
  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    instruments.findIndex(i => i.id === currentInstrumentId)
  );
  const dockRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const isSwiping = useRef(false);

  // Sync highlighted with current when current changes externally
  useEffect(() => {
    const idx = instruments.findIndex(i => i.id === currentInstrumentId);
    if (idx !== -1) {
      setHighlightedIndex(idx);
    }
  }, [currentInstrumentId]);

  // Desktop keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in an input field
      if (document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'SELECT' ||
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setHighlightedIndex(prev => {
          const newIndex = prev > 0 ? prev - 1 : instruments.length - 1;
          // Auto-select on desktop
          onInstrumentChange(instruments[newIndex].id);
          return newIndex;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setHighlightedIndex(prev => {
          const newIndex = prev < instruments.length - 1 ? prev + 1 : 0;
          // Auto-select on desktop
          onInstrumentChange(instruments[newIndex].id);
          return newIndex;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onInstrumentChange]);

  // Touch gesture handlers for mobile swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    isSwiping.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping.current) return;
    touchCurrentX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping.current) return;
    isSwiping.current = false;

    const diff = touchStartX.current - touchCurrentX.current;
    const threshold = 50; // minimum swipe distance

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swipe left - next instrument
        setHighlightedIndex(prev =>
          prev < instruments.length - 1 ? prev + 1 : 0
        );
      } else {
        // Swipe right - previous instrument
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : instruments.length - 1
        );
      }
    }
  }, []);

  // Handle tap to select
  const handleTap = useCallback((index: number) => {
    if (index === highlightedIndex) {
      // Tap on highlighted item - select it
      onInstrumentChange(instruments[index].id);
    } else {
      // Tap on non-highlighted item - highlight it first
      setHighlightedIndex(index);
    }
  }, [highlightedIndex, onInstrumentChange]);

  return (
    <div
      ref={dockRef}
      className="relative w-full py-2 px-1"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dock background - glass effect */}
      <div
        className="absolute inset-x-2 inset-y-0 rounded-xl"
        style={{
          background: `linear-gradient(180deg, ${theme.colors.surface}80 0%, ${theme.colors.background}90 100%)`,
          backdropFilter: 'blur(10px)',
          border: `1px solid ${theme.colors.primary}20`,
        }}
      />

      {/* Instruments row */}
      <div className="relative flex justify-center items-end gap-2 md:gap-4 px-4">
        {instruments.map((instrument, index) => {
          const isSelected = instrument.id === currentInstrumentId;
          const isHighlighted = index === highlightedIndex;
          const graphics = instrumentGraphics[instrument.id];

          // Scale: selected = 1.3, highlighted (not selected) = 1.15, normal = 1
          const scale = isSelected ? 1.3 : isHighlighted ? 1.15 : 1;

          return (
            <motion.button
              key={instrument.id}
              onClick={() => handleTap(index)}
              disabled={isLoading}
              className="flex flex-col items-center focus:outline-none disabled:opacity-50"
              initial={false}
              animate={{
                scale,
                y: isSelected ? -6 : isHighlighted ? -3 : 0,
              }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25,
              }}
              whileHover={{ scale: scale * 1.05 }}
              whileTap={{ scale: scale * 0.95 }}
            >
              {/* Icon container - reduced by 20% */}
              <div
                className="relative w-10 h-10 md:w-11 md:h-11 rounded-lg flex items-center justify-center shadow-lg"
                style={{
                  background: graphics.gradient,
                  border: isSelected
                    ? `2px solid ${theme.colors.primary}`
                    : isHighlighted
                    ? `2px solid ${theme.colors.primary}60`
                    : '2px solid transparent',
                  boxShadow: isSelected
                    ? `0 0 16px ${theme.colors.primaryGlow}60, 0 3px 10px rgba(0,0,0,0.3)`
                    : isHighlighted
                    ? `0 0 8px ${theme.colors.primaryGlow}30, 0 3px 6px rgba(0,0,0,0.2)`
                    : '0 2px 5px rgba(0,0,0,0.2)',
                }}
              >
                <span className="text-xl md:text-2xl">{graphics.icon}</span>

                {/* Glow overlay for selected */}
                {isSelected && (
                  <div
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at center, ${theme.colors.primaryGlow}30 0%, transparent 70%)`,
                    }}
                  />
                )}
              </div>

              {/* Label */}
              <AnimatePresence>
                {(isSelected || isHighlighted) && (
                  <motion.span
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="mt-1 text-xs md:text-sm font-medium whitespace-nowrap"
                    style={{
                      color: isSelected ? theme.colors.primary : theme.colors.textMuted,
                      textShadow: isSelected ? `0 0 10px ${theme.colors.primaryGlow}` : 'none',
                    }}
                  >
                    {instrument.name}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Selection indicator dot */}
              {isSelected && (
                <motion.div
                  layoutId="selection-indicator"
                  className="w-1.5 h-1.5 rounded-full mt-1"
                  style={{ background: theme.colors.primary }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{
              borderColor: `${theme.colors.primary}40`,
              borderTopColor: theme.colors.primary,
            }}
          />
        </div>
      )}

    </div>
  );
}
