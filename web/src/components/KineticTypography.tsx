// =============================================================
// VISUALISER — KineticTypography
// Expressive, readable animation of the recognised text.
//
// WHAT: words appear one after another; words that come from RECOGNISED SIGNS
//       ("emphasis") are larger, brighter and gently float; filler words that
//       were only added by a grammar template stay small and calm. A single
//       short word is revealed letter by letter.
// WHY:  the text is the product of the sign — the typography should show which
//       parts were actually signed.
// HOW:  Framer Motion variants with staggered children. useReducedMotion() makes
//       everything a simple fade (no movement, blur, stagger or floating).
// =============================================================

import { motion, useReducedMotion } from 'framer-motion';

interface Props {
  text: string;
  /** lower-case words (no punctuation) that come from recognised signs */
  emphasis?: string[];
  startDelay?: number;
}

const clean = (w: string) => w.replace(/[.,!?;:]/g, '').toLowerCase();

const GRADIENTS = [
  'linear-gradient(135deg, #f0f0ff 0%, #c4b5fd 100%)',
  'linear-gradient(135deg, #ddd6fe 0%, #8b5cf6 100%)',
];

export function KineticTypography({ text, emphasis = [], startDelay = 0.3 }: Props) {
  const reduce = useReducedMotion();
  const words = text.split(' ').filter(Boolean);
  const emph = new Set(emphasis.map(clean));
  const singleWord = words.length === 1 && words[0].length <= 14;

  const container = {
    hidden: {},
    visible: { transition: { delayChildren: startDelay, staggerChildren: reduce ? 0 : singleWord ? 0.06 : 0.14 } },
  };

  const item = (strong: boolean) => ({
    hidden: reduce
      ? { opacity: 0 }
      : { opacity: 0, y: 24, scale: strong ? 0.6 : 0.9, filter: 'blur(8px)' },
    visible: reduce
      ? { opacity: 1, transition: { duration: 0.4 } }
      : {
          opacity: 1, y: 0, scale: 1, filter: 'blur(0px)',
          transition: strong
            ? { type: 'spring', stiffness: 260, damping: 15 }
            : { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
        },
  });

  const gradientStyle = (i: number) => ({
    background: GRADIENTS[i % GRADIENTS.length],
    WebkitBackgroundClip: 'text' as const,
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text' as const,
  });

  // Single short word: letter-by-letter reveal
  if (singleWord) {
    return (
      <motion.p
        className="text-6xl md:text-8xl font-black text-center tracking-tight"
        style={{ fontFamily: 'Outfit, sans-serif' }}
        variants={container} initial="hidden" animate="visible" aria-label={text}
      >
        {[...words[0]].map((ch, i) => (
          <motion.span key={i} className="inline-block" variants={item(true)} aria-hidden="true" style={gradientStyle(i)}>
            {ch}
          </motion.span>
        ))}
      </motion.p>
    );
  }

  return (
    <motion.p
      className="text-center leading-tight tracking-tight"
      style={{ fontFamily: 'Outfit, sans-serif' }}
      variants={container} initial="hidden" animate="visible" aria-label={text}
    >
      {words.map((word, i) => {
        const strong = emph.has(clean(word));
        return (
          <motion.span
            key={`${word}-${i}`}
            className={`inline-block mr-3 mb-2 font-black ${strong ? 'text-5xl md:text-7xl' : 'text-3xl md:text-4xl opacity-80'}`}
            variants={item(strong)}
            aria-hidden="true"
          >
            <motion.span
              className="inline-block"
              style={gradientStyle(i)}
              animate={strong && !reduce ? { y: [0, -5, 0] } : undefined}
              transition={strong && !reduce ? { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1 + i * 0.2 } : undefined}
            >
              {word}
            </motion.span>
          </motion.span>
        );
      })}
    </motion.p>
  );
}
