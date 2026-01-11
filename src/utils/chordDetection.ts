import { Chord, Note } from 'tonal';

export interface DetectedChord {
  name: string;
  symbol: string;
  root: string;
  type: string;
  notes: string[];
  quality: 'major' | 'minor' | 'diminished' | 'augmented' | 'dominant' | 'other';
}

// Convert MIDI note numbers to pitch classes and note names
function midiToNote(midi: number): string {
  return Note.fromMidi(midi) || '';
}

function midiToPitchClass(midi: number): number {
  return midi % 12;
}

// Get unique pitch classes from MIDI notes
function getPitchClasses(midiNotes: number[]): number[] {
  const classes = new Set(midiNotes.map(midiToPitchClass));
  return Array.from(classes).sort((a, b) => a - b);
}

// Detect chord from active MIDI notes
export function detectChord(activeNotes: Set<number> | number[]): DetectedChord | null {
  const notes = Array.from(activeNotes);

  if (notes.length < 2) {
    return null;
  }

  // Get note names (with octave for context, but we'll primarily use pitch classes)
  const noteNames = notes.map(midiToNote).filter(Boolean);

  if (noteNames.length < 2) {
    return null;
  }

  // Sort by pitch and get the bass note
  const sortedNotes = [...notes].sort((a, b) => a - b);
  const bassNote = midiToNote(sortedNotes[0]);

  // Try to detect the chord using Tonal
  const detected = Chord.detect(noteNames);

  if (detected.length > 0) {
    // Get the first (most likely) match - this is already a proper chord symbol like "Cmaj7"
    const chordName = detected[0];
    const chordInfo = Chord.get(chordName);

    if (chordInfo.empty) {
      return null;
    }

    const quality = getChordQuality(chordInfo.quality || chordInfo.type);

    return {
      name: chordName,
      symbol: chordName, // Use the detected name directly - it's already formatted correctly
      root: chordInfo.tonic || bassNote,
      type: chordInfo.type,
      notes: noteNames.map(n => Note.pitchClass(n) || n),
      quality,
    };
  }

  // Fallback: try with just pitch classes (ignores inversions)
  const pitchClassNotes = getPitchClasses(notes).map(pc => Note.pitchClass(midiToNote(pc) || 'C'));
  const fallbackDetected = Chord.detect(pitchClassNotes);

  if (fallbackDetected.length > 0) {
    const chordName = fallbackDetected[0];
    const chordInfo = Chord.get(chordName);

    if (!chordInfo.empty) {
      const quality = getChordQuality(chordInfo.quality || chordInfo.type);
      return {
        name: chordName,
        symbol: chordName, // Use detected name directly
        root: chordInfo.tonic || '',
        type: chordInfo.type,
        notes: noteNames.map(n => Note.pitchClass(n) || n),
        quality,
      };
    }
  }

  return null;
}

function getChordQuality(type: string): DetectedChord['quality'] {
  const t = type.toLowerCase();
  if (t.includes('maj') || t === 'M' || t === '') return 'major';
  if (t.includes('min') || t === 'm') return 'minor';
  if (t.includes('dim')) return 'diminished';
  if (t.includes('aug')) return 'augmented';
  if (t.includes('dom') || t.includes('7')) return 'dominant';
  return 'other';
}

// Get notes that make up a specific key on a 49-key piano (C2 to C6)
export function getKeyRange(): { start: number; end: number; count: number } {
  // 49 keys: C2 (MIDI 36) to C6 (MIDI 84)
  return { start: 36, end: 84, count: 49 };
}

// Check if a MIDI note is a black key
export function isBlackKey(midiNote: number): boolean {
  const pc = midiNote % 12;
  return [1, 3, 6, 8, 10].includes(pc); // C#, D#, F#, G#, A#
}

// Get the note name for display
export function getNoteName(midiNote: number, includeOctave = false): string {
  const note = midiToNote(midiNote);
  if (!note) return '';

  if (includeOctave) {
    return note;
  }

  return Note.pitchClass(note) || '';
}
