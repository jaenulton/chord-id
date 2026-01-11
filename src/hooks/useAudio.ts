import { useState, useCallback, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { SplendidGrandPiano, Soundfont } from 'smplr';
import { DEFAULT_INSTRUMENT_ID, DEFAULT_VOLUME, getInstrument } from '../audio/instruments';

type SampledInstrument = SplendidGrandPiano | Soundfont;
type SynthInstrument = Tone.PolySynth;
type AudioInstrument = SampledInstrument | SynthInstrument;

export interface UseAudioReturn {
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  currentInstrumentId: string;
  volume: number;
  enable: () => Promise<void>;
  playNote: (midiNote: number, velocity: number) => void;
  stopNote: (midiNote: number) => void;
  setInstrument: (instrumentId: string) => Promise<void>;
  setVolume: (volume: number) => void;
}

// Convert MIDI note number to frequency
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}


export function useAudio(): UseAudioReturn {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentInstrumentId, setCurrentInstrumentId] = useState(DEFAULT_INSTRUMENT_ID);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);

  const audioContextRef = useRef<AudioContext | null>(null);
  const instrumentRef = useRef<AudioInstrument | null>(null);
  const activeNotesRef = useRef<Map<number, (() => void) | null>>(new Map());

  // Create synthesizer instruments
  const createSynth = useCallback((type: 'organ' | 'synth-pad' | 'synth-lead'): Tone.PolySynth => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: type === 'organ' ? 'sine' : type === 'synth-pad' ? 'sawtooth' : 'square',
      },
      envelope: {
        attack: type === 'organ' ? 0.01 : type === 'synth-pad' ? 0.3 : 0.01,
        decay: type === 'organ' ? 0.1 : type === 'synth-pad' ? 0.5 : 0.2,
        sustain: type === 'organ' ? 1 : type === 'synth-pad' ? 0.8 : 0.5,
        release: type === 'organ' ? 0.1 : type === 'synth-pad' ? 1.5 : 0.3,
      },
    }).toDestination();

    // Adjust volume
    synth.volume.value = -6;

    return synth;
  }, []);

  // Load a sampled instrument
  const loadSampledInstrument = useCallback(async (
    context: AudioContext,
    instrumentId: string
  ): Promise<SampledInstrument> => {
    switch (instrumentId) {
      case 'grand-piano':
        const piano = new SplendidGrandPiano(context);
        await piano.load;
        return piano;

      case 'electric-piano':
        const ePiano = new Soundfont(context, { instrument: 'electric_piano_1' });
        await ePiano.load;
        return ePiano;

      case 'strings':
        const strings = new Soundfont(context, { instrument: 'string_ensemble_1' });
        await strings.load;
        return strings;

      default:
        const defaultPiano = new SplendidGrandPiano(context);
        await defaultPiano.load;
        return defaultPiano;
    }
  }, []);

  // Enable audio (requires user gesture)
  const enable = useCallback(async () => {
    if (isEnabled) return;

    setIsLoading(true);
    setError(null);

    try {
      // Start Tone.js (needed for synths)
      await Tone.start();
      console.log('Tone.js started, state:', Tone.context.state);

      // Create audio context for smplr samplers
      const context = new AudioContext();

      // Ensure context is running (might be suspended)
      if (context.state === 'suspended') {
        await context.resume();
      }

      audioContextRef.current = context;
      console.log('AudioContext created, state:', context.state);

      // Load default instrument (Grand Piano)
      try {
        const instrument = await loadSampledInstrument(context, DEFAULT_INSTRUMENT_ID);
        instrumentRef.current = instrument;
        console.log('Instrument loaded:', instrument);
      } catch (loadError) {
        console.error('Failed to load instrument, falling back to synth:', loadError);
        // Fall back to a synth if sample loading fails
        const synth = createSynth('organ');
        instrumentRef.current = synth;
        setCurrentInstrumentId('organ');
      }

      setIsEnabled(true);
      console.log('Audio enabled successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enable audio';
      console.error('Failed to enable audio:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isEnabled, loadSampledInstrument, createSynth]);

  // Set instrument
  const setInstrument = useCallback(async (instrumentId: string) => {
    if (!audioContextRef.current) return;

    const instrument = getInstrument(instrumentId);
    setIsLoading(true);

    try {
      // Stop all current notes
      if (instrumentRef.current) {
        if ('releaseAll' in instrumentRef.current) {
          (instrumentRef.current as Tone.PolySynth).releaseAll();
        }
      }

      if (instrument.type === 'sampled') {
        const sampler = await loadSampledInstrument(audioContextRef.current, instrumentId);
        instrumentRef.current = sampler;
      } else {
        // Create synth based on type
        const synthType = instrumentId as 'organ' | 'synth-pad' | 'synth-lead';
        const synth = createSynth(synthType);
        instrumentRef.current = synth;
      }

      setCurrentInstrumentId(instrumentId);
    } catch (error) {
      console.error('Failed to load instrument:', error);
    } finally {
      setIsLoading(false);
    }
  }, [loadSampledInstrument, createSynth]);

  // Play a note
  const playNote = useCallback((midiNote: number, velocity: number) => {
    if (!instrumentRef.current) {
      console.warn('No instrument loaded');
      return;
    }

    const instrument = instrumentRef.current;

    if (instrument instanceof Tone.PolySynth) {
      // Tone.js synth expects velocity 0-1
      const normalizedVelocity = Math.max(0.1, velocity / 127);
      const freq = midiToFreq(midiNote);
      instrument.triggerAttack(freq, Tone.now(), normalizedVelocity);
      activeNotesRef.current.set(midiNote, null);
    } else {
      // smplr expects velocity 0-127 (not normalized!)
      const midiVelocity = Math.max(10, Math.min(127, Math.round(velocity)));
      console.log('Playing sampled note:', { midiNote, velocity: midiVelocity });
      const result = instrument.start({ note: midiNote, velocity: midiVelocity });
      activeNotesRef.current.set(midiNote, typeof result === 'function' ? result : null);
    }
  }, []);

  // Stop a note
  const stopNote = useCallback((midiNote: number) => {
    if (!instrumentRef.current) return;

    const instrument = instrumentRef.current;

    if (instrument instanceof Tone.PolySynth) {
      // Tone.js synth
      const freq = midiToFreq(midiNote);
      instrument.triggerRelease(freq, Tone.now());
    } else {
      // smplr sampled instrument - call the stored stop function
      const stopFn = activeNotesRef.current.get(midiNote);
      if (stopFn) {
        stopFn();
      }
    }

    activeNotesRef.current.delete(midiNote);
  }, []);

  // Set volume
  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(newVolume);

    // Update Tone.js synth volume if active
    if (instrumentRef.current instanceof Tone.PolySynth) {
      // Convert 0-100 to dB (-60 to 0)
      const db = newVolume === 0 ? -Infinity : -60 + (newVolume / 100) * 54;
      instrumentRef.current.volume.value = db;
    }

    // For smplr instruments, volume is controlled per-note via velocity
    // We'll store the volume and apply it in playNote
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (instrumentRef.current) {
        if ('releaseAll' in instrumentRef.current) {
          (instrumentRef.current as Tone.PolySynth).releaseAll();
        }
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    isEnabled,
    isLoading,
    error,
    currentInstrumentId,
    volume,
    enable,
    playNote,
    stopNote,
    setInstrument,
    setVolume,
  };
}
