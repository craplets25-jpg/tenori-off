import * as Tone from 'tone';

export const STEP_COUNT = 16;
export const STEP_SUBDIVISION = '16n';
export const DEFAULT_STEP_MILLISECONDS = 100;
export const MIN_STEP_MILLISECONDS = 40;
export const MAX_STEP_MILLISECONDS = 2000;

export function normalizeStepMilliseconds(
  value,
  fallback = DEFAULT_STEP_MILLISECONDS,
) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    MAX_STEP_MILLISECONDS,
    Math.max(MIN_STEP_MILLISECONDS, Math.round(parsed)),
  );
}

export function stepMillisecondsToBpm(stepMilliseconds) {
  const normalized = normalizeStepMilliseconds(stepMilliseconds);
  // One grid step is one sixteenth note, or one quarter of a beat.
  return 60_000 / (normalized * 4);
}

export function createStepSequence({
  tone = Tone,
  context,
  onStep,
}) {
  const options = {
    callback: (time, column) => onStep(column, time),
    events: Array.from({length: STEP_COUNT}, (_, column) => column),
    subdivision: STEP_SUBDIVISION,
    loop: true,
  };

  if (context) {
    options.context = context;
  }

  return new tone.Sequence(options).start(0);
}

export class TransportSequencer {
  constructor({
    tone = Tone,
    context = tone.getContext(),
    stepMilliseconds = DEFAULT_STEP_MILLISECONDS,
    onStep,
    onDraw,
    onPause,
  }) {
    this.tone = tone;
    this.context = context;
    this.transport = context.transport || tone.getTransport();
    this.draw = context.draw || tone.getDraw();
    this.onDraw = onDraw;
    this.onPause = onPause;

    this._wantsToPlay = false;
    this._isPlaying = false;
    this._unlockPromise = null;

    this.sequence = createStepSequence({
      tone,
      context,
      onStep: (column, time) => {
        onStep(column, time);
        if (this.onDraw) {
          this.draw.schedule(() => this.onDraw(column), time);
        }
      },
    });

    this.setStepMilliseconds(stepMilliseconds);
  }

  get isPlaying() {
    return this._isPlaying;
  }

  get wantsToPlay() {
    return this._wantsToPlay;
  }

  setStepMilliseconds(value) {
    this.stepMilliseconds = normalizeStepMilliseconds(value);
    this.transport.bpm.value = stepMillisecondsToBpm(this.stepMilliseconds);
    return this.stepMilliseconds;
  }

  async start() {
    this._wantsToPlay = true;

    if (!this._unlockPromise) {
      try {
        // Tone.start() must be invoked synchronously from the user gesture.
        this._unlockPromise = Promise.resolve(this.tone.start());
      } catch (error) {
        this._wantsToPlay = false;
        throw error;
      }
    }

    const unlockAttempt = this._unlockPromise;
    try {
      await unlockAttempt;
    } catch (error) {
      this._wantsToPlay = false;
      throw error;
    } finally {
      // Share one in-flight resume attempt across rapid clicks, but call
      // Tone.start() again on a later play in case the browser re-suspended
      // the AudioContext while the page was in the background.
      if (this._unlockPromise === unlockAttempt) {
        this._unlockPromise = null;
      }
    }

    if (this._wantsToPlay && !this._isPlaying) {
      this.transport.start();
      this._isPlaying = true;
    }

    return this._isPlaying;
  }

  pause() {
    this._wantsToPlay = false;
    if (this._isPlaying) {
      this.transport.pause();
      this._isPlaying = false;
    }
    this.draw.cancel();
    if (this.onPause) {
      this.onPause();
    }
    return false;
  }

  stop() {
    this._wantsToPlay = false;
    this._isPlaying = false;
    this.transport.stop();
    this.draw.cancel();
    if (this.onPause) {
      this.onPause();
    }
  }

  toggle() {
    if (this._wantsToPlay || this._isPlaying) {
      return Promise.resolve(this.pause());
    }
    return this.start();
  }

  dispose() {
    this.stop();
    this.sequence.dispose();
  }
}
