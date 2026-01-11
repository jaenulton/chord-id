export interface Instrument {
  id: string;
  name: string;
  type: 'sampled' | 'synth';
  icon: string;
}

export const instruments: Instrument[] = [
  { id: 'grand-piano', name: 'Grand Piano', type: 'sampled', icon: '🎹' },
  { id: 'electric-piano', name: 'Electric Piano', type: 'sampled', icon: '🎸' },
  { id: 'strings', name: 'Strings', type: 'sampled', icon: '🎻' },
  { id: 'organ', name: 'Organ', type: 'synth', icon: '🎛️' },
  { id: 'synth-pad', name: 'Synth Pad', type: 'synth', icon: '🌊' },
  { id: 'synth-lead', name: 'Synth Lead', type: 'synth', icon: '⚡' },
];

export const getInstrument = (id: string): Instrument => {
  return instruments.find(i => i.id === id) || instruments[0];
};

export const DEFAULT_INSTRUMENT_ID = 'grand-piano';
export const DEFAULT_VOLUME = 80;
