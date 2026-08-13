import {AudioEngine} from '../audio.js';
import {TransportSequencer, DEFAULT_STEP_MILLISECONDS} from '../sequencer.js';
import {Board} from './helpers.js';

let isMouseDown = false;
let animationSpeed = DEFAULT_STEP_MILLISECONDS;
let useRNN = false;
let forceInputToDrums = true;

const audioEngine = new AudioEngine();
const board = new Board();
const sequencer = new TransportSequencer({
  stepMilliseconds: animationSpeed,
  onStep: (column, time) => audioEngine.playColumn(board.data, column, time),
  onDraw: (column) => board.animate(column),
  onPause: () => {
    audioEngine.releaseAll();
    board.clearAnimation();
  },
});

let model;
let modelUrl;

init();

function init() {
  if (window.location.hash) {
    try {
      const hash = window.location.hash.slice(1);
      const parsed = hash.split('&');
      board.data = decode(parsed[0]);
      if (parsed[1]) {
        animationSpeed = sequencer.setStepMilliseconds(parsed[1]);
      }
      board.draw();
    } catch (error) {
      window.location.hash = 'not-a-valid-pattern-url';
    }
  }

  const speedInput = document.getElementById('input');
  speedInput.value = animationSpeed;

  document.getElementById('container').addEventListener('mousedown', (event) => {
    isMouseDown = true;
    clickCell(event);
  });
  document.getElementById('container').addEventListener('mouseup', () => {
    isMouseDown = false;
  });
  document.getElementById('container').addEventListener('mouseover', clickCell);
  speedInput.addEventListener('change', (event) => {
    animationSpeed = sequencer.setStepMilliseconds(event.target.value);
    event.target.value = animationSpeed;
    updateLocation();
  });
  document.getElementById('radioRnn').addEventListener('click', (event) => {
    useRNN = event.target.checked;
    document.getElementById('modelName').value = 'drum_kit_rnn';
    document.getElementById('radioForceDrumNo').click();
  });
  document.getElementById('radioVae').addEventListener('click', (event) => {
    useRNN = !event.target.checked;
    document.getElementById('modelName').value = 'drums_2bar_lokl_small';
    document.getElementById('radioForceDrumYes').click();
  });
  document.getElementById('radioForceDrumYes').addEventListener('click', (event) => {
    forceInputToDrums = event.target.checked;
  });
  document.getElementById('radioForceDrumNo').addEventListener('click', (event) => {
    forceInputToDrums = !event.target.checked;
  });

  document.body.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea')) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 's':
        playSynth();
        break;
      case 'd':
        playDrums();
        break;
      case 'p':
        playOrPause();
        break;
      case 'i':
        autoDrums();
        break;
      case 'm':
        showSettings();
        break;
      default:
        return;
    }
    event.preventDefault();
  });
}

function reset(clearLocation = false) {
  board.reset();
  audioEngine.releaseAll();
  if (clearLocation) {
    window.location.hash = '';
  }
}

function clickCell(event) {
  const button = event.target;

  if (button.localName !== 'button' || !isMouseDown) {
    return;
  }

  const x = Number.parseInt(button.dataset.row, 10);
  const y = Number.parseInt(button.dataset.col, 10);
  board.toggleCell(x, y, audioEngine.getSound(), button);
  updateLocation();
}

/***********************************
 * Sample demos
 ***********************************/
function loadDemo(which) {
  switch (which) {
    case 1:
      board.data = decode('0000000000000000000000000000000022222000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000200020002000200000000000000000000000000000000000000000101000000000000001010101010010000010101010');
      break;
    case 2:
      board.data = decode('0000000000000000000000000000000000000000000000000000011001100000000001100110000000020000000020000002000000002000000020000002000000000222222000000000000000000000001000010000000000100000001101100011100100121210001010010001210000101001000010000000000000000000');
      break;
    case 3:
      board.data = decode('2222220001001000000000000000000000222222020220220000000000000000000000110000000000001000000000000001000000010000000000000000000000000000000010000010000000000000010000000000000001000000000010000100000000000000000000000000100000000000000000000000010101010000');
      break;
    case 4:
      board.data = decode('2202020202202020000020000020200000202002200220220002002000020001200000220021020000010000000000000000000100000000101010101010101000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000');
      break;
    case 5:
      board.data = decode('0000000000000000000111100000000000000000000000000011111000000000000010000000000000010000010000000010000001000000000000000100000000000000100000000000001100000000000000000010010000000000001001000000000000100100000000000000010000000000000010000000000000000000');
      break;
    default:
      return;
  }
  updateLocation();
  board.draw();
}

/***********************************
 * UI actions
 ***********************************/
async function playOrPause() {
  const container = document.getElementById('container');
  const button = document.getElementById('btnPlay');

  if (sequencer.wantsToPlay || sequencer.isPlaying) {
    sequencer.pause();
    container.classList.remove('playing');
    button.textContent = 'Play!';
    return;
  }

  container.classList.add('playing');
  button.textContent = 'Pause';

  try {
    const isPlaying = await sequencer.start();
    container.classList.toggle('playing', isPlaying);
    button.textContent = isPlaying ? 'Pause' : 'Play!';
  } catch (error) {
    console.error('Unable to start audio', error);
    container.classList.remove('playing');
    button.textContent = 'Play!';
  }
}

function playSynth() {
  audioEngine.isSynth = true;
  document.getElementById('btnSynth').classList.add('synth');
  document.getElementById('btnDrums').classList.remove('drums');
}

function playDrums() {
  audioEngine.isSynth = false;
  document.getElementById('btnSynth').classList.remove('synth');
  document.getElementById('btnDrums').classList.add('drums');
}

function showHelp() {
  const box = document.getElementById('help');
  box.hidden = !box.hidden;
}

function showSettings() {
  const box = document.getElementById('settings');
  if (!box.hidden) {
    loadModel();
  }
  box.hidden = !box.hidden;
}

async function autoDrums() {
  const button = document.getElementById('btnAuto');

  if (button.hasAttribute('not-loaded')) {
    await loadModel();
    return;
  }

  button.disabled = true;
  const sequence = board.getSynthSequence(forceInputToDrums);

  try {
    let dream;
    if (useRNN) {
      dream = await model.continueSequence(sequence, 16, 1.3);
    } else {
      const encoded = await model.encode([sequence]);
      const decoded = await model.decode(encoded);
      dream = decoded[0];
    }
    board.drawDreamSequence(dream, sequence);
    updateLocation();
  } catch (error) {
    console.error('Unable to generate drums', error);
  } finally {
    button.disabled = false;
  }
}

async function loadModel() {
  const button = document.getElementById('btnAuto');
  button.textContent = 'Loading...';
  button.disabled = true;

  const name = document.getElementById('modelName').value.trim();
  const root = useRNN ? 'music_rnn' : 'music_vae';
  const url = `https://storage.googleapis.com/magentadata/js/checkpoints/${root}/${name}`;

  try {
    if (!model || modelUrl !== url) {
      // Load only the selected model implementation when the user opts in.
      if (useRNN) {
        const {MusicRNN} = await import('@magenta/music/esm/music_rnn.js');
        model = new MusicRNN(url);
      } else {
        const {MusicVAE} = await import('@magenta/music/esm/music_vae.js');
        model = new MusicVAE(url);
      }
      modelUrl = url;
    }

    await model.initialize();
    button.removeAttribute('not-loaded');
    button.textContent = 'Improvise!';
  } catch (error) {
    console.error('Unable to load the selected model', error);
    button.textContent = 'Load ML(~10Mb)';
  } finally {
    button.disabled = false;
  }
}

/***********************************
 * Save and load application state
 ***********************************/
function updateLocation() {
  window.location.hash = `#${encode(board.data)}&${animationSpeed}`;
}

function encode(arr) {
  let bits = '';
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      bits += arr[i][j].on || 0;
    }
  }
  return bits;
}

function decode(bits) {
  const arr = [];
  for (let i = 0; i < 16; i++) {
    const row = [];
    arr.push(row);
    for (let j = 0; j < 16; j++) {
      arr[i][j] = {};
      const value = bits.charAt(i * 16 + j);
      if (value !== '0') {
        arr[i][j].on = Number.parseInt(value, 10);
      }
    }
  }
  return arr;
}

Object.assign(window, {
  autoDrums,
  loadDemo,
  playDrums,
  playOrPause,
  playSynth,
  reset,
  showHelp,
  showSettings,
});

window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    sequencer.dispose();
    audioEngine.dispose();
  }
});
