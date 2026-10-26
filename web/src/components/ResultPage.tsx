// =============================================================
// VISUALISER — ResultPage
// Shows the outcome of ONE recognition request:
//   recognized    -> kinetic typography + the signs + timings
//   unknown_sign  -> an honest "not recognised" message (never a guess)
// A MOCK banner is shown whenever the ML service ran in mock mode.
// =============================================================

import { motion } from 'framer-motion';
import { KineticTypography } from './KineticTypography';
import type { ComposeResult, MLResult, Sign } from '../types';

interface Props {
  result: MLResult;
  /** signs accepted so far in this sentence (including the current one) */
  sequence: Sign[];
  composed: ComposeResult | null;
  composeError: string | null;
  onTryAgain: () => void;
  onAddSign: () => void;
  onStartOver: () => void;
}

const METHOD_LABEL: Record<string, string> = {
  single_sign: 'one sign → its dictionary word',
  template: 'fixed grammar template (only function words added)',
  fallback_list: 'no safe template for this combination → plain list, nothing guessed',
};

const REASON_TEXT: Record<string, string> = {
  LOW_CONFIDENCE: 'The model was not confident enough to name this sign.',
  NO_KNOWN_SIGN: 'No sign from the trained vocabulary was detected in this clip.',
};

export function ResultPage({ result, sequence, composed, composeError, onTryAgain, onAddSign, onStartOver }: Props) {
  const isMock = result.is_mock;
  const unknown = result.outcome === 'unknown_sign';
  const text = composed?.text ?? result.text;
  const emphasis = composed?.emphasis ?? result.emphasis;
  const method = composed?.text_method ?? result.text_method;
  const t = result.timings ?? {};

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-24">
      <motion.div className="w-full max-w-2xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        {isMock && (
          <div role="status" className="mb-4 px-4 py-2 rounded-lg border text-center text-xs font-medium tracking-widest"
            style={{ background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)', color: '#f59e0b' }}>
            ⚠️ MOCK / DEMO RESULT — no trained model ran. This is NOT a real recognition.
          </div>
        )}

        {unknown ? (
          <div className="glass-card p-8 text-center mb-6" role="status">
            <div className="text-5xl mb-4" aria-hidden="true">🤔</div>
            <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Sign not recognised</h2>
            <p className="text-text-secondary text-sm mb-4">
              {REASON_TEXT[result.reason ?? ''] ?? 'The sign could not be recognised.'} Try again, signing clearly in the frame.
            </p>
            {result.alternatives.length > 0 && (
              <p className="text-text-muted text-xs">
                Closest candidates (model scores, not accuracy):{' '}
                {result.alternatives.map(a => `${a.label}${a.confidence !== null ? ` ${Math.round(a.confidence * 100)}%` : ''}`).join(' · ')}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="glass-card p-8 mb-6 relative overflow-hidden">
              <div className="absolute inset-0 opacity-30 pointer-events-none" aria-hidden="true"
                style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(124,58,237,0.3) 0%, transparent 70%)' }} />
              <div className="relative z-10">
                <p className="text-xs font-medium tracking-widest text-text-muted uppercase mb-6 text-center">
                  {sequence.length > 1 ? `Your sentence (${sequence.length} signs)` : 'Recognized text'}
                </p>
                <div className="py-4 min-h-[140px] flex items-center justify-center">
                  {/* key forces the animation to replay when the text changes */}
                  <KineticTypography key={text} text={text || '—'} emphasis={emphasis} />
                </div>
                {METHOD_LABEL[method] && (
                  <p className="text-center text-text-muted text-xs mt-4">Text made by: {METHOD_LABEL[method]}</p>
                )}
                {composeError && <p className="text-center text-error text-xs mt-2" role="alert">{composeError}</p>}
              </div>
            </div>

            {sequence.length > 0 && (
              <motion.div className="glass-card p-6 mb-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <p className="text-xs font-medium tracking-widest text-text-muted uppercase mb-4">Detected signs</p>
                <div className="flex flex-wrap gap-2">
                  {sequence.map((s, i) => (
                    <div key={`${s.label}-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
                      <span className="text-accent-bright font-semibold text-sm">{s.label}</span>
                      {s.confidence !== null && (
                        <span className="text-text-muted text-xs" title="Classifier probability — a model score, not measured accuracy">
                          score {Math.round(s.confidence * 100)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}

        {result.processing_time_ms !== undefined && (
          <p className="text-center text-text-muted text-xs mb-8">
            Recognition: {result.processing_time_ms} ms
            {t.decode_ms !== undefined && ` (decode ${t.decode_ms} · features ${t.features_ms} · model ${t.inference_ms})`}
          </p>
        )}

        <div className="flex justify-center gap-3 flex-wrap">
          <button id="btn-try-again" className="btn-secondary" onClick={onTryAgain}>↩ Try again</button>
          {!unknown && !isMock && (
            <button id="btn-add-sign" className="btn-primary" onClick={onAddSign}>+ Add another sign</button>
          )}
          {sequence.length > 0 && (
            <button id="btn-start-over" className="btn-secondary" onClick={onStartOver}>Start over</button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
