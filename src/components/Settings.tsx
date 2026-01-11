import { motion, AnimatePresence } from 'framer-motion';
import { Theme, themes } from '../themes';
import { instruments } from '../audio/instruments';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: Theme;
  onThemeChange: (themeId: string) => void;
  visualMode: '2d' | '3d';
  onModeChange: (mode: '2d' | '3d') => void;
  midiInputs: { id: string; name: string }[];
  selectedMidiInput: string | null;
  onMidiInputChange: (inputId: string) => void;
  isMidiConnected: boolean;
  onMidiConnect: () => void;
  // Audio settings
  isAudioEnabled: boolean;
  isAudioLoading: boolean;
  currentInstrumentId: string;
  onInstrumentChange: (instrumentId: string) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
}

export function Settings({
  isOpen,
  onClose,
  currentTheme,
  onThemeChange,
  visualMode,
  onModeChange,
  midiInputs,
  selectedMidiInput,
  onMidiInputChange,
  isMidiConnected,
  onMidiConnect,
  isAudioEnabled,
  isAudioLoading,
  currentInstrumentId,
  onInstrumentChange,
  volume,
  onVolumeChange,
}: SettingsProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-80 glass z-50 overflow-y-auto"
            style={{
              background: `linear-gradient(180deg, ${currentTheme.colors.surface} 0%, ${currentTheme.colors.background} 100%)`,
              borderLeft: `1px solid ${currentTheme.colors.primary}30`,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2
                className="text-xl font-bold"
                style={{ color: currentTheme.colors.text }}
              >
                Settings
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                style={{ color: currentTheme.colors.textMuted }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-8">
              {/* MIDI Connection */}
              <section>
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-4"
                  style={{ color: currentTheme.colors.textMuted }}
                >
                  MIDI Device
                </h3>

                {!isMidiConnected ? (
                  <button
                    onClick={onMidiConnect}
                    className="w-full py-3 px-4 rounded-lg font-medium transition-all hover:scale-[1.02]"
                    style={{
                      background: `linear-gradient(135deg, ${currentTheme.colors.primary} 0%, ${currentTheme.colors.secondary} 100%)`,
                      color: currentTheme.colors.text,
                      boxShadow: `0 0 20px ${currentTheme.colors.primaryGlow}40`,
                    }}
                  >
                    Connect MIDI Device
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm" style={{ color: currentTheme.colors.primary }}>
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      MIDI Connected
                    </div>

                    {midiInputs.length > 0 && (
                      <select
                        value={selectedMidiInput || ''}
                        onChange={(e) => onMidiInputChange(e.target.value)}
                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 outline-none focus:border-white/30 transition-colors"
                        style={{ color: currentTheme.colors.text }}
                      >
                        {midiInputs.map(input => (
                          <option key={input.id} value={input.id} style={{ background: currentTheme.colors.surface }}>
                            {input.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </section>

              {/* Instrument Selection */}
              {isAudioEnabled && (
                <section>
                  <h3
                    className="text-sm font-semibold uppercase tracking-wider mb-4"
                    style={{ color: currentTheme.colors.textMuted }}
                  >
                    Instrument {isAudioLoading && <span className="animate-pulse">...</span>}
                  </h3>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {instruments.map(instrument => (
                      <button
                        key={instrument.id}
                        onClick={() => onInstrumentChange(instrument.id)}
                        disabled={isAudioLoading}
                        className="py-2 px-3 rounded-lg font-medium transition-all text-left flex items-center gap-2 disabled:opacity-50"
                        style={{
                          background: currentInstrumentId === instrument.id
                            ? `linear-gradient(135deg, ${currentTheme.colors.primary}40 0%, ${currentTheme.colors.secondary}40 100%)`
                            : 'rgba(255,255,255,0.05)',
                          border: currentInstrumentId === instrument.id
                            ? `2px solid ${currentTheme.colors.primary}`
                            : '2px solid transparent',
                          color: currentInstrumentId === instrument.id
                            ? currentTheme.colors.primary
                            : currentTheme.colors.textMuted,
                        }}
                      >
                        <span>{instrument.icon}</span>
                        <span className="text-xs">{instrument.name}</span>
                      </button>
                    ))}
                  </div>

                  {/* Volume Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs" style={{ color: currentTheme.colors.textMuted }}>
                      <span>Volume</span>
                      <span>{volume}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(e) => onVolumeChange(Number(e.target.value))}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, ${currentTheme.colors.primary} 0%, ${currentTheme.colors.primary} ${volume}%, rgba(255,255,255,0.1) ${volume}%, rgba(255,255,255,0.1) 100%)`,
                      }}
                    />
                  </div>
                </section>
              )}

              {/* Visualization Mode */}
              <section>
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-4"
                  style={{ color: currentTheme.colors.textMuted }}
                >
                  Visualization
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  {(['2d', '3d'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => onModeChange(mode)}
                      className="py-3 px-4 rounded-lg font-medium transition-all uppercase"
                      style={{
                        background: visualMode === mode
                          ? `linear-gradient(135deg, ${currentTheme.colors.primary}40 0%, ${currentTheme.colors.secondary}40 100%)`
                          : 'rgba(255,255,255,0.05)',
                        border: visualMode === mode
                          ? `2px solid ${currentTheme.colors.primary}`
                          : '2px solid transparent',
                        color: visualMode === mode
                          ? currentTheme.colors.primary
                          : currentTheme.colors.textMuted,
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-2" style={{ color: currentTheme.colors.textMuted }}>
                  {visualMode === '2d' ? 'Neon glow aesthetic' : 'Realistic 3D piano'}
                </p>
              </section>

              {/* Theme Selection */}
              <section>
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-4"
                  style={{ color: currentTheme.colors.textMuted }}
                >
                  Color Theme
                </h3>

                <div className="grid grid-cols-3 gap-3">
                  {themes.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => onThemeChange(theme.id)}
                      className="aspect-square rounded-xl p-1 transition-all hover:scale-105"
                      style={{
                        background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
                        border: currentTheme.id === theme.id
                          ? '3px solid white'
                          : '3px solid transparent',
                        boxShadow: currentTheme.id === theme.id
                          ? `0 0 20px ${theme.colors.primaryGlow}`
                          : 'none',
                      }}
                      title={theme.name}
                    >
                      <span className="sr-only">{theme.name}</span>
                    </button>
                  ))}
                </div>
                <p className="text-center mt-3 text-sm font-medium" style={{ color: currentTheme.colors.primary }}>
                  {currentTheme.name}
                </p>
              </section>

              {/* Info */}
              <section className="pt-4 border-t border-white/10">
                <div className="text-center text-xs" style={{ color: currentTheme.colors.textMuted }}>
                  <p>49-Key Piano (C2 - C6)</p>
                  <p className="mt-1">Connect your MIDI keyboard</p>
                  <p className="mt-1">and start playing!</p>
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function SettingsButton({
  onClick,
  theme,
}: {
  onClick: () => void;
  theme: Theme;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="fixed top-4 right-4 z-30 p-3 rounded-xl glass"
      style={{
        borderColor: `${theme.colors.primary}30`,
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <svg
        className="w-6 h-6"
        fill="none"
        stroke={theme.colors.primary}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    </motion.button>
  );
}
