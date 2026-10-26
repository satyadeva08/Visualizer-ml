// =============================================================
// VISUALISER — HomePage
// =============================================================

import { motion } from 'framer-motion';

import type { HealthInfo } from '../types';

interface HomePageProps {
  onStart: () => void;
  health: HealthInfo | null;
  onCollect?: () => void;
}

/** One honest line about what the system can do right now (from /api/v1/health). */
function statusLine(h: HealthInfo | null): { text: string; warn: boolean } {
  if (!h) return { text: 'Checking server…', warn: false };
  if (!h.backendReachable) return { text: 'Server not reachable — start the Go backend (see docs/DEVELOPMENT_SETUP.md).', warn: true };
  if (!h.mlReachable) return { text: 'Recognition service not running — start the Python ML service.', warn: true };
  if (h.mode === 'real') return { text: `Model ready · ${h.labels.length} signs: ${h.labels.join(', ')}`, warn: false };
  if (h.mode === 'mock') return { text: 'MOCK MODE — results are fake demo data, not real recognition.', warn: true };
  return { text: 'No trained model yet — record training clips and run training/train.py (see docs).', warn: true };
}

export function HomePage({ onStart, health, onCollect }: HomePageProps) {
  const status = statusLine(health);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient background circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(91,33,182,0.08) 0%, transparent 70%)' }} />
      </div>

      <motion.div
        className="text-center relative z-10 max-w-2xl mx-auto"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Logo mark */}
        <motion.div
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-8 mx-auto"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
          animate={{ boxShadow: ['0 0 20px rgba(124,58,237,0.4)', '0 0 50px rgba(124,58,237,0.7)', '0 0 20px rgba(124,58,237,0.4)'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M8 28V14l6 6V14M20 28V12M26 14l6 6-6 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>

        {/* Title */}
        <motion.h1
          className="text-7xl md:text-8xl font-black tracking-tight mb-4"
          style={{ fontFamily: 'Outfit, sans-serif' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <span style={{
            background: 'linear-gradient(135deg, #f0f0ff 0%, #a78bfa 50%, #7c3aed 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            VISUALISER
          </span>
        </motion.h1>

        {/* Tagline */}
        <motion.p
          className="text-lg md:text-xl text-text-secondary font-light mb-3 tracking-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          Indian Sign Language → Expressive Text
        </motion.p>

        {/* Description */}
        <motion.p
          className="text-base text-text-muted mb-12 max-w-md mx-auto leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          Record a short ISL sign. Watch it transform into animated kinetic typography.
        </motion.p>

        {/* CTA Button */}
        <motion.button
          id="btn-start-signing"
          className="btn-primary text-base"
          onClick={onStart}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="10" cy="10" r="3" fill="currentColor"/>
          </svg>
          Start Signing
        </motion.button>

        <p className={`mt-6 text-xs max-w-md mx-auto ${status.warn ? 'text-warning' : 'text-text-muted'}`} role="status" id="system-status">
          {status.text}
        </p>
        {health?.collectEnabled && onCollect && (
          <button id="btn-collect" className="btn-secondary mt-4 text-xs" onClick={onCollect}>Collect training clips</button>
        )}

        {/* Feature pills */}
        <motion.div
          className="flex flex-wrap justify-center gap-3 mt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          {['Isolated-sign recognition', 'Kinetic Typography', 'Clips deleted after analysis'].map((label) => (
            <span
              key={label}
              className="px-4 py-2 rounded-full text-xs font-medium text-text-secondary border border-surface-border"
              style={{ background: 'rgba(30,30,63,0.5)' }}
            >
              {label}
            </span>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll hint */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-text-muted text-xs tracking-widest uppercase"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ delay: 2, duration: 2, repeat: Infinity }}
        aria-hidden="true"
      >
        powered by isl
      </motion.div>
    </div>
  );
}
