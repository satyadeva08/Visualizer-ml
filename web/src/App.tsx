// =============================================================
// VISUALISER — App.tsx
// Top-level state machine (no router needed):
//   home -> camera (record + upload + processing screen) -> result
//   result -> "Add another sign" -> camera -> result  (sentence building)
//   home -> collect   (development tool, only if the backend enables it)
//
// Sentence building: the model recognises ONE isolated sign per clip. To make a
// sentence the user records several clips; their labels are sent to
// /api/v1/compose which applies the grounded templates (no guessing).
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HomePage } from './components/HomePage';
import { CameraPage } from './components/CameraPage';
import { ResultPage } from './components/ResultPage';
import { CollectPage } from './components/CollectPage';
import { composeText, fetchHealth } from './api/client';
import { ApiError } from './types';
import type { AppPage, ComposeResult, HealthInfo, RecognitionResponse, Sign } from './types';

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.25, ease: 'easeIn' } },
} as const;

function App() {
  const [page, setPage] = useState<AppPage>(window.location.hash === '#collect' ? 'collect' : 'home');
  const [response, setResponse] = useState<RecognitionResponse | null>(null);
  const [sequence, setSequence] = useState<Sign[]>([]);
  const [composed, setComposed] = useState<ComposeResult | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    if (page === 'home') {
      setHealth(null);
      fetchHealth().then(setHealth);
    }
  }, [page]);

  const reset = useCallback(() => {
    setResponse(null); setSequence([]); setComposed(null); setComposeError(null);
  }, []);

  const goHome = () => { reset(); window.location.hash = ''; setPage('home'); };

  const handleResult = async (res: RecognitionResponse) => {
    const r = res.result;
    setResponse(res);
    setComposeError(null);

    // Only REAL, recognised signs are added to the sentence. Mock and unknown results never are.
    if (r.outcome === 'recognized' && !r.is_mock && r.signs.length > 0) {
      const next = [...sequence, ...r.signs];
      setSequence(next);
      if (next.length > 1) {
        try {
          setComposed(await composeText(next.map(s => s.label)));
        } catch (e) {
          setComposed(null);
          setComposeError(e instanceof ApiError ? e.message : 'Could not build the sentence.');
        }
      } else {
        setComposed(null);
      }
    }
    setPage('result');
  };

  return (
    <div className="min-h-screen">
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
        style={{ background: 'linear-gradient(to bottom, rgba(10,10,26,0.9), transparent)' }}>
        <button id="nav-logo" className="font-black text-lg tracking-widest text-text-primary hover:text-accent transition-colors"
          style={{ fontFamily: 'Outfit, sans-serif' }} onClick={goHome} aria-label="VISUALISER — go to home">
          VISUALISER
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted hidden sm:block">Indian Sign Language</span>
          <span className="px-2 py-0.5 text-xs rounded-full font-medium"
            style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.3)' }}>
            MVP
          </span>
        </div>
      </nav>

      <AnimatePresence mode="wait">
        {page === 'home' && (
          <motion.div key="home" variants={pageVariants} initial="initial" animate="enter" exit="exit">
            <HomePage health={health} onStart={() => { reset(); setPage('camera'); }}
              onCollect={() => { window.location.hash = '#collect'; setPage('collect'); }} />
          </motion.div>
        )}

        {page === 'camera' && (
          <motion.div key={`camera-${sequence.length}-${response?.job_id ?? 'new'}`} variants={pageVariants} initial="initial" animate="enter" exit="exit">
            <CameraPage onResult={handleResult} onBack={goHome} signNumber={sequence.length + 1} />
          </motion.div>
        )}

        {page === 'result' && response && (
          <motion.div key="result" variants={pageVariants} initial="initial" animate="enter" exit="exit">
            <ResultPage
              result={response.result}
              sequence={sequence}
              composed={composed}
              composeError={composeError}
              onTryAgain={() => {
                // Re-record the LAST sign: drop it from the sentence if it was just added.
                if (response.result.outcome === 'recognized' && !response.result.is_mock) {
                  const kept = sequence.slice(0, Math.max(0, sequence.length - response.result.signs.length));
                  setSequence(kept); setComposed(null);
                }
                setPage('camera');
              }}
              onAddSign={() => setPage('camera')}
              onStartOver={() => { reset(); setPage('camera'); }}
            />
          </motion.div>
        )}

        {page === 'collect' && (
          <motion.div key="collect" variants={pageVariants} initial="initial" animate="enter" exit="exit">
            <CollectPage onBack={goHome} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
