import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Theme } from '../themes';
import { Poll } from '../hooks/usePolls';

interface PollCardProps {
  poll: Poll;
  theme: Theme;
  onVote: (pollId: number, optionIndex: number) => Promise<boolean>;
  onDismiss: (pollId: number) => Promise<boolean> | void;
}

export function PollCard({ poll, theme, onVote, onDismiss }: PollCardProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const handleVote = async (optionIndex: number) => {
    if (poll.user_voted || isVoting) return;

    setIsVoting(true);
    setSelectedOption(optionIndex);

    const success = await onVote(poll.id, optionIndex);

    if (!success) {
      setSelectedOption(null);
    }

    setIsVoting(false);
  };

  const handleDismiss = async () => {
    if (isDismissing) return;

    setIsDismissing(true);
    // Call dismiss - it handles the optimistic update
    await onDismiss(poll.id);
    // No need to reset isDismissing since the component will be unmounted
  };

  const getPercentage = (index: number): number => {
    if (poll.total_votes === 0) return 0;
    return Math.round((poll.vote_counts[index] / poll.total_votes) * 100);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="relative w-80 max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden shadow-2xl"
      style={{
        background: `linear-gradient(135deg, ${theme.colors.surface} 0%, ${theme.colors.background} 100%)`,
        border: `1px solid ${theme.colors.primary}40`,
        boxShadow: `0 10px 40px rgba(0, 0, 0, 0.5), 0 0 20px ${theme.colors.primary}20`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-3 pb-2">
        <div className="flex items-center gap-2">
          <div
            className="p-1.5 rounded-lg"
            style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: theme.colors.primary }}
          >
            Poll
          </span>
        </div>

        {/* Dismiss button (X) - persists dismissal to server */}
        <button
          onClick={handleDismiss}
          disabled={isDismissing}
          className="p-1 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-50"
          style={{ color: theme.colors.textMuted }}
          title="Dismiss this poll"
        >
          {isDismissing ? (
            <div
              className="w-4 h-4 border-2 rounded-full animate-spin"
              style={{
                borderColor: `${theme.colors.textMuted}40`,
                borderTopColor: theme.colors.textMuted,
              }}
            />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </button>
      </div>

      {/* Question */}
      <div className="px-3 pb-2">
        <h4
          className="font-semibold text-sm leading-tight"
          style={{ color: theme.colors.text }}
        >
          {poll.question}
        </h4>
      </div>

      {/* Options */}
      <div className="px-3 pb-3 space-y-2">
        {poll.options.map((option, index) => {
          const percentage = getPercentage(index);
          const isSelected = poll.user_vote_index === index || selectedOption === index;
          const showResults = poll.user_voted;

          return (
            <motion.button
              key={index}
              onClick={() => handleVote(index)}
              disabled={poll.user_voted || isVoting}
              className="relative w-full text-left rounded-lg overflow-hidden transition-all"
              style={{
                background: showResults ? `${theme.colors.surface}` : `${theme.colors.surface}80`,
                border: `1px solid ${isSelected ? theme.colors.primary : theme.colors.primary}30`,
              }}
              whileHover={!poll.user_voted && !isVoting ? { scale: 1.02 } : {}}
              whileTap={!poll.user_voted && !isVoting ? { scale: 0.98 } : {}}
            >
              {/* Progress bar (shown after voting) */}
              {showResults && (
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-lg"
                  style={{
                    background: isSelected
                      ? `linear-gradient(90deg, ${theme.colors.primary}40 0%, ${theme.colors.primary}20 100%)`
                      : `${theme.colors.primary}15`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              )}

              <div className="relative flex items-center justify-between px-3 py-2">
                <span
                  className="text-sm"
                  style={{ color: theme.colors.text }}
                >
                  {option}
                </span>

                {showResults && (
                  <span
                    className="text-xs font-medium"
                    style={{ color: theme.colors.textMuted }}
                  >
                    {percentage}%
                  </span>
                )}

                {isSelected && !showResults && isVoting && (
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{
                      borderColor: `${theme.colors.primary}40`,
                      borderTopColor: theme.colors.primary,
                    }}
                  />
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="px-3 py-2 text-xs"
        style={{
          color: theme.colors.textMuted,
          borderTop: `1px solid ${theme.colors.primary}10`,
        }}
      >
        {poll.user_voted ? (
          <span>{poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}</span>
        ) : (
          <span>Tap an option to vote</span>
        )}
      </div>
    </motion.div>
  );
}

interface PollContainerProps {
  polls: Poll[];
  theme: Theme;
  onVote: (pollId: number, optionIndex: number) => Promise<boolean>;
  onDismiss: (pollId: number) => Promise<boolean> | void;
}

export function PollContainer({ polls, theme, onVote, onDismiss }: PollContainerProps) {
  if (polls.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 z-[99] pointer-events-none">
      <div className="flex flex-col gap-3 pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {polls.slice(0, 2).map(poll => (
            <PollCard
              key={poll.id}
              poll={poll}
              theme={theme}
              onVote={onVote}
              onDismiss={onDismiss}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
