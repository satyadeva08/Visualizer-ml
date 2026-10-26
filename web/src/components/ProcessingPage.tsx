// =============================================================
// VISUALISER — ProcessingPage
// Shown while the video is being analyzed by the backend
// =============================================================

import { motion } from 'framer-motion';

export function ProcessingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        className="text-center max-w-sm mx-auto"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Animated sign analysis visualization */}
        <div className="relative w-32 h-32 mx-auto mb-10">
          {/* Outer ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: 'rgba(124,58,237,0.3)' }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Middle ring */}
          <motion.div
            className="absolute inset-4 rounded-full border-2"
            style={{ borderColor: 'rgba(124,58,237,0.5)' }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          />
          {/* Spinning arc */}
          <motion.div
            className="absolute inset-2 rounded-full border-2 border-transparent"
            style={{ borderTopColor: '#7c3aed', borderRightColor: '#a78bfa' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          />
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.svg
              width="32" height="32" viewBox="0 0 32 32" fill="none"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden="true"
            >
              {/* Hand sign shape */}
              <path d="M12 8v10M16 6v12M20 9v9M8 14v6M24 12v6" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round"/>
            </motion.svg>
          </div>
        </div>

        {/* Status text */}
        <motion.h2
          className="text-2xl font-bold text-text-primary mb-3"
          style={{ fontFamily: 'Outfit, sans-serif' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Analyzing your sign…
        </motion.h2>

        {/* Animated steps */}
        <div className="space-y-2 text-left inline-block" role="status" aria-live="polite" aria-label="Processing status">
          {[
            { label: 'Uploading video', delay: 0.5 },
            { label: 'Extracting landmarks', delay: 1.0 },
            { label: 'Running recognition', delay: 1.5 },
            { label: 'Generating text', delay: 2.0 },
          ].map(({ label, delay }) => (
            <motion.div
              key={label}
              className="flex items-center gap-3 text-sm text-text-secondary"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay, duration: 0.4 }}
            >
              <motion.span
                className="w-2 h-2 rounded-full bg-accent block flex-shrink-0"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, delay }}
                aria-hidden="true"
              />
              {label}
            </motion.div>
          ))}
        </div>

        <motion.p
          className="text-text-muted text-xs mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
        >
          This takes a few seconds on first run.
        </motion.p>
      </motion.div>
    </div>
  );
}
