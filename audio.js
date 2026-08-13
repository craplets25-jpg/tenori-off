import * as Tone from 'tone';

const SYNTH_NOTES = [
  'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4',
  'B3', 'A3', 'G3', 'F3', 'E3', 'D3', 'C3',
  'B2', 'A2', 'G2', 'F2',
];

class DrumKit {
  constructor({tone = Tone, context = tone.getContext(), output}) {
    this.tone = tone;

    const connect = (instrument) => instrument.connect(output);

    this.kick = connect(new tone.MembraneSynth({
      context,
      volume: -3,
      pitchDecay: 0.03,
      octaves: 6,
      envelope: {attack: 0.001, decay: 0.35, sustain: 0, release: 0.1},
    }));
    this.snare = connect(new tone.NoiseSynth({
      context,
      volume: -10,
      noise: {type: 'white'},
      envelope: {attack: 0.002, decay: 0.08, sustain: 0, release: 0.12},
    }));
    this.closedHihat = connect(new tone.MetalSynth({
      context,
      volume: -12,
      frequency: 400,
      envelope: {attack: 0.001, decay: 0.05, release: 0.03},
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1,
    }));
    this.openHihat = connect(new tone.MetalSynth({
      context,
      volume: -12,
      frequency: 400,
      envelope: {attack: 0.001, decay: 0.3, release: 0.2},
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1,
    }));
    this.tomLow = connect(this._makeTom(context));
    this.tomMid = connect(this._makeTom(context));
    this.tomHigh = connect(this._makeTom(context));
    this.crash = connect(new tone.MetalSynth({
      context,
      volume: -12,
      frequency: 300,
      envelope: {attack: 0.001, decay: 0.8, release: 1.5},
      harmonicity: 5.1,
      modulationIndex: 48,
      resonance: 4000,
      octaves: 1.5,
    }));
    this.ride = connect(new tone.MetalSynth({
      context,
      volume: -12,
      frequency: 520,
      envelope: {attack: 0.001, decay: 0.25, release: 0.4},
      harmonicity: 5.1,
      modulationIndex: 24,
      resonance: 5000,
      octaves: 1,
    }));

    // Rows 9-15 intentionally repeat the corresponding Magenta drum classes
    // from the original instrument with slightly different pitch or velocity.
    this.triggers = [
      (time) => this.kick.triggerAttackRelease('C2', '8n', time, 0.9),
      (time) => this.snare.triggerAttackRelease('16n', time, 0.85),
      (time) => this.closedHihat.triggerAttackRelease('32n', time, 0.35),
      (time) => this.openHihat.triggerAttackRelease('8n', time, 0.35),
      (time) => this.tomLow.triggerAttackRelease('G2', '8n', time, 0.65),
      (time) => this.tomMid.triggerAttackRelease('C3', '8n', time, 0.65),
      (time) => this.tomHigh.triggerAttackRelease('F3', '8n', time, 0.65),
      (time) => this.crash.triggerAttackRelease('2n', time, 0.35),
      (time) => this.ride.triggerAttackRelease('8n', time, 0.3),
      (time) => this.kick.triggerAttackRelease('G1', '8n', time, 0.7),
      (time) => this.snare.triggerAttackRelease('32n', time, 0.55),
      (time) => this.tomLow.triggerAttackRelease('C2', '8n', time, 0.55),
      (time) => this.tomMid.triggerAttackRelease('G3', '8n', time, 0.55),
      (time) => this.tomHigh.triggerAttackRelease('C4', '8n', time, 0.55),
      (time) => this.ride.triggerAttackRelease('16n', time, 0.22),
      (time) => this.closedHihat.triggerAttackRelease('64n', time, 0.25),
    ];
  }

  _makeTom(context) {
    return new this.tone.MembraneSynth({
      context,
      volume: -8,
      pitchDecay: 0.008,
      envelope: {attack: 0.005, decay: 0.3, sustain: 0, release: 0.1},
    });
  }

  trigger(row, time) {
    const trigger = this.triggers[row];
    if (trigger) {
      trigger(time);
    }
  }

  dispose() {
    [
      this.kick,
      this.snare,
      this.closedHihat,
      this.openHihat,
      this.tomLow,
      this.tomMid,
      this.tomHigh,
      this.crash,
      this.ride,
    ].forEach((instrument) => instrument.dispose());
  }
}

export class AudioEngine {
  constructor({tone = Tone, context = tone.getContext()} = {}) {
    this.tone = tone;
    this.context = context;
    this.isSynth = true;

    // All sound sources share this graph and AudioContext:
    // instruments -> channels -> mix bus -> safety limiter -> destination.
    this.limiter = new tone.Limiter({context, threshold: -1}).toDestination();
    this.mixBus = new tone.Gain({context, gain: 0.72}).connect(this.limiter);
    this.synthBus = new tone.Channel({context, volume: -6}).connect(this.mixBus);
    this.drumBus = new tone.Channel({context, volume: -3}).connect(this.mixBus);

    this.synth = new tone.PolySynth({
      context,
      voice: tone.Synth,
      maxPolyphony: 32,
      options: {
        oscillator: {type: 'triangle'},
        envelope: {attack: 0.005, decay: 0.08, sustain: 0.45, release: 0.12},
      },
    }).connect(this.synthBus);

    this.drums = new DrumKit({tone, context, output: this.drumBus});
  }

  getSound() {
    return this.isSynth ? 1 : 2;
  }

  playColumn(boardData, column, time) {
    const synthNotes = [];
    const drumRows = [];

    for (let row = 0; row < boardData.length; row++) {
      const sound = boardData[row][column].on;
      if (sound === 1) {
        synthNotes.push(SYNTH_NOTES[row]);
      } else if (sound === 2) {
        drumRows.push(row);
      }
    }

    if (synthNotes.length > 0) {
      this.synth.triggerAttackRelease(synthNotes, '16n', time, 0.68);
    }
    drumRows.forEach((row) => this.drums.trigger(row, time));
  }

  releaseAll(time = this.tone.now()) {
    this.synth.releaseAll(time);
  }

  dispose() {
    this.releaseAll();
    this.drums.dispose();
    this.synth.dispose();
    this.synthBus.dispose();
    this.drumBus.dispose();
    this.mixBus.dispose();
    this.limiter.dispose();
  }
}
