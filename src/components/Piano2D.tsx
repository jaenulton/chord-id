import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Theme } from '../themes';
import { isBlackKey, getKeyRange, getNoteName } from '../utils/chordDetection';

// Hook to detect mobile and orientation
function useResponsive() {
  const [state, setState] = useState({
    isMobile: false,
    isPortrait: false,
  });

  useEffect(() => {
    const checkResponsive = () => {
      const isMobile = window.innerWidth <= 768 || 'ontouchstart' in window;
      const isPortrait = window.innerHeight > window.innerWidth;
      setState({ isMobile, isPortrait });
    };

    checkResponsive();
    window.addEventListener('resize', checkResponsive);
    window.addEventListener('orientationchange', checkResponsive);

    return () => {
      window.removeEventListener('resize', checkResponsive);
      window.removeEventListener('orientationchange', checkResponsive);
    };
  }, []);

  return state;
}

interface Piano2DProps {
  activeNotes: Set<number>;
  theme: Theme;
}

interface WhiteKeyProps {
  midiNote: number;
  isActive: boolean;
  theme: Theme;
  index: number;
  totalWhiteKeys: number;
  isMobileLandscape?: boolean;
}

interface BlackKeyProps {
  isActive: boolean;
  theme: Theme;
  whiteKeyIndex: number;
  totalWhiteKeys: number;
}

const WhiteKey = ({ midiNote, isActive, theme, index, totalWhiteKeys, isMobileLandscape }: WhiteKeyProps) => {
  const noteName = getNoteName(midiNote);
  const keyWidth = 100 / totalWhiteKeys;

  return (
    <motion.div
      className="absolute bottom-0 flex flex-col justify-end items-center cursor-pointer select-none rounded-b-md"
      style={{
        width: `${keyWidth}%`,
        height: '100%',
        left: `${index * keyWidth}%`,
        border: '1px solid #333',
        borderTop: 'none',
      }}
      initial={false}
      animate={{
        backgroundColor: isActive ? theme.colors.primary : '#fafafa',
        boxShadow: isActive
          ? `0 0 25px ${theme.colors.primaryGlow}, 0 0 50px ${theme.colors.primaryGlow}50, inset 0 -8px 15px rgba(0,0,0,0.15)`
          : `inset 0 -8px 15px rgba(0,0,0,0.08), inset 0 0 3px rgba(0,0,0,0.05)`,
      }}
      transition={{ duration: 0.05 }}
    >
      {/* Key surface gradient */}
      <div
        className="absolute inset-0 rounded-b-md pointer-events-none"
        style={{
          background: isActive
            ? `linear-gradient(180deg, ${theme.colors.primary} 0%, ${theme.colors.primaryGlow}90 100%)`
            : 'linear-gradient(180deg, #ffffff 0%, #f0f0f0 60%, #e8e8e8 100%)',
        }}
      />
      {/* Note label - hidden on mobile landscape, bold on desktop */}
      {!isMobileLandscape && (
        <span
          className="relative z-10 pb-3"
          style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            color: isActive ? '#fff' : '#444',
            textShadow: isActive ? `0 0 10px ${theme.colors.primaryGlow}` : 'none',
          }}
        >
          {noteName}
        </span>
      )}
    </motion.div>
  );
};

const BlackKey = ({ isActive, theme, whiteKeyIndex, totalWhiteKeys }: BlackKeyProps) => {
  const whiteKeyWidth = 100 / totalWhiteKeys;
  // Black key positioned at the right edge of the white key, overlapping two white keys
  const leftPosition = (whiteKeyIndex + 1) * whiteKeyWidth - (whiteKeyWidth * 0.35);

  return (
    <motion.div
      className="absolute top-0 z-10 rounded-b-md cursor-pointer select-none"
      style={{
        width: `${whiteKeyWidth * 0.65}%`,
        height: '62%',
        left: `${leftPosition}%`,
      }}
      initial={false}
      animate={{
        backgroundColor: isActive ? theme.colors.primary : '#1a1a1a',
        boxShadow: isActive
          ? `0 0 20px ${theme.colors.primaryGlow}, 0 0 40px ${theme.colors.primaryGlow}60`
          : `0 4px 8px rgba(0,0,0,0.5), inset 0 -4px 8px rgba(0,0,0,0.4)`,
      }}
      transition={{ duration: 0.05 }}
    >
      {/* Key surface gradient */}
      <div
        className="absolute inset-0 rounded-b-md pointer-events-none"
        style={{
          background: isActive
            ? `linear-gradient(180deg, ${theme.colors.primaryGlow} 0%, ${theme.colors.primary} 100%)`
            : 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 40%, #0f0f0f 100%)',
          border: isActive ? `1px solid ${theme.colors.primaryGlow}60` : '1px solid #000',
        }}
      />
    </motion.div>
  );
};

export function Piano2D({ activeNotes, theme }: Piano2DProps) {
  const { start, end } = getKeyRange();
  const { isMobile, isPortrait } = useResponsive();

  const keys = useMemo(() => {
    const result: { midiNote: number; isBlack: boolean; whiteKeyIndex: number }[] = [];
    let whiteKeyIndex = 0;

    for (let note = start; note <= end; note++) {
      const black = isBlackKey(note);
      result.push({
        midiNote: note,
        isBlack: black,
        whiteKeyIndex: black ? whiteKeyIndex - 1 : whiteKeyIndex++,
      });
    }

    return result;
  }, [start, end]);

  const whiteKeys = keys.filter(k => !k.isBlack);
  const blackKeys = keys.filter(k => k.isBlack);
  const totalWhiteKeys = whiteKeys.length;

  const isMobileLandscape = isMobile && !isPortrait;

  // Portrait mode on mobile - show message instead of keyboard
  if (isMobile && isPortrait) {
    return (
      <div
        className="relative w-full h-full rounded-xl overflow-hidden flex items-center justify-center"
        style={{
          background: `linear-gradient(180deg, ${theme.colors.surface} 0%, ${theme.colors.background} 100%)`,
        }}
      >
        <div className="text-center px-8">
          <div
            className="text-4xl mb-4"
            style={{ color: theme.colors.primary }}
          >
            🎹
          </div>
          <p
            className="text-lg font-medium mb-2"
            style={{ color: theme.colors.text }}
          >
            Rotate for Piano View
          </p>
          <p
            className="text-sm"
            style={{ color: theme.colors.textMuted }}
          >
            Turn your device to landscape mode to see the keyboard
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full rounded-xl overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${theme.colors.surface} 0%, ${theme.colors.background} 100%)`,
        boxShadow: `0 0 60px ${theme.colors.primary}15, inset 0 0 60px ${theme.colors.background}80`,
      }}
    >
      {/* Glow effect behind active keys */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-200"
        style={{
          background: activeNotes.size > 0
            ? `radial-gradient(ellipse at center 90%, ${theme.colors.primaryGlow}20 0%, transparent 60%)`
            : 'none',
          opacity: activeNotes.size > 0 ? 1 : 0,
        }}
      />

      {/* Piano container - taller on mobile landscape */}
      <div
        className="relative w-full h-full"
        style={{
          padding: isMobileLandscape ? '4px 2px 2px 2px' : '24px 24px 24px 24px',
          paddingTop: isMobileLandscape ? '4px' : '32px',
        }}
      >
        <div
          className="relative w-full rounded-lg overflow-hidden"
          style={{
            height: isMobileLandscape ? '100%' : '85%',
            background: '#2a2a2a',
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
            padding: isMobileLandscape ? '4px 2px 2px 2px' : '8px 4px 4px 4px',
          }}
        >
          <div className="relative w-full h-full">
            {/* White keys */}
            {whiteKeys.map((key, index) => (
              <WhiteKey
                key={key.midiNote}
                midiNote={key.midiNote}
                isActive={activeNotes.has(key.midiNote)}
                theme={theme}
                index={index}
                totalWhiteKeys={totalWhiteKeys}
                isMobileLandscape={isMobileLandscape}
              />
            ))}

            {/* Black keys */}
            {blackKeys.map(key => (
              <BlackKey
                key={key.midiNote}
                isActive={activeNotes.has(key.midiNote)}
                theme={theme}
                whiteKeyIndex={key.whiteKeyIndex}
                totalWhiteKeys={totalWhiteKeys}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Subtle reflection at bottom - hide on mobile landscape */}
      {!isMobileLandscape && (
        <div
          className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none"
          style={{
            background: `linear-gradient(0deg, ${theme.colors.background} 0%, transparent 100%)`,
          }}
        />
      )}
    </div>
  );
}
