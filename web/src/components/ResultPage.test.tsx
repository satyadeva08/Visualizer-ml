import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultPage } from './ResultPage';
import type { MLResult } from '../types';

const base: MLResult = {
  signs: [{ label: 'HELLO', confidence: 0.92 }], text: 'Hello', text_method: 'single_sign',
  emphasis: ['hello'], outcome: 'recognized', reason: null, alternatives: [],
  timings: { decode_ms: 10, features_ms: 5, inference_ms: 1 }, processing_time_ms: 40, is_mock: false,
};
const noop = vi.fn();
const props = { sequence: base.signs, composed: null, composeError: null, onTryAgain: noop, onAddSign: noop, onStartOver: noop };

describe('ResultPage', () => {
  it('shows the recognised sign, its model score and real timings', () => {
    render(<ResultPage result={base} {...props} />);
    expect(screen.getByText('HELLO')).toBeInTheDocument();
    expect(screen.getByText(/score 92%/)).toBeInTheDocument();
    expect(screen.getByText(/Recognition: 40 ms/)).toBeInTheDocument();
    expect(screen.queryByText(/MOCK/)).not.toBeInTheDocument();
  });

  it('shows the MOCK banner and hides "Add another sign" for mock results', () => {
    render(<ResultPage result={{ ...base, is_mock: true }} {...props} />);
    expect(screen.getByText(/MOCK \/ DEMO RESULT/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add another sign/ })).not.toBeInTheDocument();
  });

  it('shows an honest "not recognised" message for unknown signs and never invents text', () => {
    const unknown: MLResult = { ...base, signs: [], text: '', outcome: 'unknown_sign', reason: 'LOW_CONFIDENCE',
      alternatives: [{ label: 'YES', confidence: 0.31 }] };
    render(<ResultPage result={unknown} {...props} sequence={[]} />);
    expect(screen.getByText('Sign not recognised')).toBeInTheDocument();
    expect(screen.getByText(/not confident enough/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add another sign/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('offers to add another sign for a real recognition', () => {
    render(<ResultPage result={base} {...props} />);
    expect(screen.getByRole('button', { name: /Add another sign/ })).toBeInTheDocument();
  });
});
