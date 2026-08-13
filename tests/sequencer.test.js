import {describe, expect, it, vi} from 'vitest';
import {
  createStepSequence,
  MAX_STEP_MILLISECONDS,
  MIN_STEP_MILLISECONDS,
  normalizeStepMilliseconds,
  stepMillisecondsToBpm,
  TransportSequencer,
} from '../sequencer.js';

describe('tempo validation', () => {
  it('clamps invalid and unsafe step durations', () => {
    expect(normalizeStepMilliseconds('')).toBe(100);
    expect(normalizeStepMilliseconds('not-a-number')).toBe(100);
    expect(normalizeStepMilliseconds(-1)).toBe(MIN_STEP_MILLISECONDS);
    expect(normalizeStepMilliseconds(20_000)).toBe(MAX_STEP_MILLISECONDS);
    expect(normalizeStepMilliseconds(123.7)).toBe(124);
  });

  it('maps a 100ms sixteenth note to 150 BPM', () => {
    expect(stepMillisecondsToBpm(100)).toBe(150);
  });
});

describe('step sequence configuration', () => {
  it('creates one looping Tone.Sequence containing all 16 columns', () => {
    let options;
    class FakeSequence {
      constructor(sequenceOptions) {
        options = sequenceOptions;
      }

      start(time) {
        this.startTime = time;
        return this;
      }
    }

    const sequence = createStepSequence({
      tone: {Sequence: FakeSequence},
      context: {name: 'offline-test-context'},
      onStep: vi.fn(),
    });

    expect(options.events).toEqual(
      Array.from({length: 16}, (_, column) => column),
    );
    expect(options.subdivision).toBe('16n');
    expect(options.loop).toBe(true);
    expect(options.context.name).toBe('offline-test-context');
    expect(sequence.startTime).toBe(0);
  });
});

describe('rapid play/pause handling', () => {
  it('honors the final requested state without starting duplicate Transports', async () => {
    let resolveUnlock;
    const unlock = new Promise((resolve) => {
      resolveUnlock = resolve;
    });

    class FakeSequence {
      start() {
        return this;
      }

      dispose() {}
    }

    const transport = {
      bpm: {value: 0},
      start: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
    };
    const draw = {
      schedule: vi.fn(),
      cancel: vi.fn(),
    };
    const context = {transport, draw};
    const tone = {
      Sequence: FakeSequence,
      getContext: () => context,
      getTransport: () => transport,
      getDraw: () => draw,
      start: vi.fn(() => unlock),
    };
    const sequencer = new TransportSequencer({
      tone,
      context,
      onStep: vi.fn(),
      onDraw: vi.fn(),
    });

    const firstStart = sequencer.toggle();
    await sequencer.toggle(); // Pause while audio is still unlocking.
    const finalStart = sequencer.toggle();
    resolveUnlock();

    await Promise.all([firstStart, finalStart]);

    expect(tone.start).toHaveBeenCalledTimes(1);
    expect(transport.start).toHaveBeenCalledTimes(1);
    expect(transport.pause).not.toHaveBeenCalled();
    expect(sequencer.isPlaying).toBe(true);

    sequencer.pause();
    expect(transport.pause).toHaveBeenCalledTimes(1);
    expect(sequencer.isPlaying).toBe(false);

    await sequencer.start();
    expect(tone.start).toHaveBeenCalledTimes(2);
    expect(transport.start).toHaveBeenCalledTimes(2);

    sequencer.dispose();
  });
});
