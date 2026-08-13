import {afterEach, describe, expect, it, vi} from 'vitest';
import * as Tone from 'tone';
import {AudioEngine} from '../audio.js';
import {createStepSequence} from '../sequencer.js';

afterEach(() => {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  Tone.getDraw().cancel();
});

describe('Tone offline scheduling', () => {
  it('schedules all 16 columns at exact sixteenth-note times', async () => {
    const steps = [];

    await Tone.Offline((context) => {
      context.transport.bpm.value = 150;
      createStepSequence({
        tone: Tone,
        context,
        onStep: (column, time) => steps.push({column, time}),
      });
      context.transport.start(0);
    }, 1.59, 1, 44_100);

    expect(steps.map(({column}) => column)).toEqual(
      Array.from({length: 16}, (_, column) => column),
    );
    steps.forEach(({time}, index) => {
      expect(time).toBeCloseTo(index * 0.1, 5);
    });
  });

  it('renders scheduled grid audio through the shared mix and limiter', async () => {
    const boardData = Array.from({length: 16}, () =>
      Array.from({length: 16}, () => ({})),
    );
    boardData[6][0].on = 1;
    boardData[0][1].on = 2;

    const buffer = await Tone.Offline((context) => {
      context.transport.bpm.value = 150;
      const engine = new AudioEngine({tone: Tone, context});
      createStepSequence({
        tone: Tone,
        context,
        onStep: (column, time) => engine.playColumn(boardData, column, time),
      });
      context.transport.start(0);
    }, 0.3, 1, 44_100);

    const samples = buffer.getChannelData(0);
    const peak = samples.reduce(
      (maximum, sample) => Math.max(maximum, Math.abs(sample)),
      0,
    );
    expect(peak).toBeGreaterThan(0.001);
    expect(peak).toBeLessThanOrEqual(1);
  });
});

describe('scheduled trigger times', () => {
  it('forwards one shared Transport time to synth and drum triggers', () => {
    const engine = new AudioEngine();
    const synthTrigger = vi
      .spyOn(engine.synth, 'triggerAttackRelease')
      .mockReturnValue(engine.synth);
    const drumTrigger = vi.spyOn(engine.drums, 'trigger');
    const boardData = Array.from({length: 16}, () =>
      Array.from({length: 16}, () => ({})),
    );
    boardData[0][3].on = 1;
    boardData[1][3].on = 2;
    boardData[15][3].on = 2;

    engine.playColumn(boardData, 3, 12.5);

    expect(synthTrigger).toHaveBeenCalledWith(['B4'], '16n', 12.5, 0.68);
    expect(drumTrigger.mock.calls).toEqual([
      [1, 12.5],
      [15, 12.5],
    ]);

    engine.dispose();
  });
});
