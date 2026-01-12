import { motion, AnimatePresence } from 'framer-motion';
import { Theme } from '../themes';
import { DetectedChord } from '../utils/chordDetection';

interface ChordDisplayProps {
  chord: DetectedChord | null;
  theme: Theme;
  activeNotes: Set<number>;
}

export function ChordDisplay({ chord, theme, activeNotes }: ChordDisplayProps) {
  const noteCount = activeNotes.size;

  return (
    <div className="absolute top-[58px] left-[30px] z-20">
      <AnimatePresence mode="wait">
        {chord ? (
          <motion.div
            key={chord.name}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="glass rounded-xl px-6 py-3 text-center"
            style={{
              boxShadow: `0 0 32px ${theme.colors.primaryGlow}30, 0 0 64px ${theme.colors.primaryGlow}15`,
              borderColor: `${theme.colors.primary}40`,
            }}
          >
            {/* Chord symbol - reduced from text-5xl to text-4xl (20% smaller) */}
            <motion.div
              className="text-4xl font-bold tracking-tight"
              style={{
                color: theme.colors.primary,
                textShadow: `0 0 16px ${theme.colors.primaryGlow}, 0 0 32px ${theme.colors.primaryGlow}60`,
              }}
              animate={{
                scale: [1, 1.02, 1],
              }}
              transition={{ duration: 0.3 }}
            >
              {chord.symbol}
            </motion.div>

            {/* Chord type label */}
            <div
              className="text-xs mt-1.5 font-medium uppercase tracking-widest"
              style={{ color: theme.colors.textMuted }}
            >
              {formatChordType(chord.type)}
            </div>

            {/* Notes being played */}
            <div className="flex gap-1.5 justify-center mt-2">
              {chord.notes.map((note, i) => (
                <motion.span
                  key={`${note}-${i}`}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                  style={{
                    backgroundColor: `${theme.colors.primary}20`,
                    color: theme.colors.primary,
                    border: `1px solid ${theme.colors.primary}40`,
                  }}
                >
                  {note}
                </motion.span>
              ))}
            </div>
          </motion.div>
        ) : noteCount > 0 ? (
          <motion.div
            key="notes-only"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass rounded-xl px-5 py-2 text-center"
            style={{ borderColor: `${theme.colors.primary}20` }}
          >
            <div
              className="text-lg font-medium"
              style={{ color: theme.colors.textMuted }}
            >
              {noteCount === 1 ? 'Single Note' : `${noteCount} Notes`}
            </div>
            <div
              className="text-[10px] mt-0.5"
              style={{ color: theme.colors.textMuted }}
            >
              {noteCount < 3 ? 'Add more notes to form a chord' : 'Chord not recognized'}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function formatChordType(type: string): string {
  const typeNames: Record<string, string> = {
    'major': 'Major',
    'M': 'Major',
    '': 'Major',
    'minor': 'Minor',
    'm': 'Minor',
    'maj7': 'Major 7th',
    'M7': 'Major 7th',
    '7': 'Dominant 7th',
    'dom7': 'Dominant 7th',
    'm7': 'Minor 7th',
    'min7': 'Minor 7th',
    'dim': 'Diminished',
    'dim7': 'Diminished 7th',
    'aug': 'Augmented',
    'sus2': 'Suspended 2nd',
    'sus4': 'Suspended 4th',
    'add9': 'Add 9',
    '9': '9th',
    'm9': 'Minor 9th',
    'maj9': 'Major 9th',
    '11': '11th',
    '13': '13th',
    'mM7': 'Minor Major 7th',
    'm7b5': 'Half Diminished',
  };

  return typeNames[type] || type || 'Major';
}
