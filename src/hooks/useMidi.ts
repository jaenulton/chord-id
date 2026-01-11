import { useState, useEffect, useCallback } from 'react';
import { WebMidi, Input, NoteMessageEvent } from 'webmidi';

export interface MidiCallbacks {
  onNoteOn?: (note: number, velocity: number) => void;
  onNoteOff?: (note: number) => void;
}

export interface MidiState {
  isEnabled: boolean;
  isConnecting: boolean;
  error: string | null;
  inputs: Input[];
  selectedInput: Input | null;
  activeNotes: Set<number>;
}

export interface UseMidiReturn extends MidiState {
  connect: () => Promise<void>;
  selectInput: (inputId: string) => void;
  disconnect: () => void;
}

export function useMidi(callbacks?: MidiCallbacks): UseMidiReturn {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Input[]>([]);
  const [selectedInput, setSelectedInput] = useState<Input | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  const handleNoteOn = useCallback((e: NoteMessageEvent) => {
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.add(e.note.number);
      return next;
    });
    // Call audio callback
    callbacks?.onNoteOn?.(e.note.number, e.note.attack * 127);
  }, [callbacks]);

  const handleNoteOff = useCallback((e: NoteMessageEvent) => {
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.delete(e.note.number);
      return next;
    });
    // Call audio callback
    callbacks?.onNoteOff?.(e.note.number);
  }, [callbacks]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      await WebMidi.enable();
      setIsEnabled(true);
      setInputs([...WebMidi.inputs]);

      // Auto-select first input if available
      if (WebMidi.inputs.length > 0) {
        const firstInput = WebMidi.inputs[0];
        setSelectedInput(firstInput);
        firstInput.addListener('noteon', handleNoteOn);
        firstInput.addListener('noteoff', handleNoteOff);
      }

      // Listen for device changes
      WebMidi.addListener('connected', () => {
        setInputs([...WebMidi.inputs]);
      });

      WebMidi.addListener('disconnected', () => {
        setInputs([...WebMidi.inputs]);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enable MIDI';
      setError(message);
      console.error('MIDI Error:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [handleNoteOn, handleNoteOff]);

  const selectInput = useCallback((inputId: string) => {
    // Remove listeners from current input
    if (selectedInput) {
      selectedInput.removeListener('noteon', handleNoteOn);
      selectedInput.removeListener('noteoff', handleNoteOff);
    }

    // Clear active notes
    setActiveNotes(new Set());

    // Find and select new input
    const newInput = WebMidi.inputs.find(i => i.id === inputId);
    if (newInput) {
      setSelectedInput(newInput);
      newInput.addListener('noteon', handleNoteOn);
      newInput.addListener('noteoff', handleNoteOff);
    } else {
      setSelectedInput(null);
    }
  }, [selectedInput, handleNoteOn, handleNoteOff]);

  const disconnect = useCallback(() => {
    if (selectedInput) {
      selectedInput.removeListener('noteon', handleNoteOn);
      selectedInput.removeListener('noteoff', handleNoteOff);
    }
    setActiveNotes(new Set());
    setSelectedInput(null);
    WebMidi.disable();
    setIsEnabled(false);
    setInputs([]);
  }, [selectedInput, handleNoteOn, handleNoteOff]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (WebMidi.enabled) {
        WebMidi.disable();
      }
    };
  }, []);

  return {
    isEnabled,
    isConnecting,
    error,
    inputs,
    selectedInput,
    activeNotes,
    connect,
    selectInput,
    disconnect,
  };
}
