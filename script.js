import {AudioEngine} from './audio.js';
import {Board} from './helpers.js';
import {
  DEFAULT_STEP_MILLISECONDS,
  TransportSequencer,
} from './sequencer.js';

let isMouseDown = false;
let animationSpeed = DEFAULT_STEP_MILLISECONDS;

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

// The RNN continues an initial sequence in a matching musical style.
let rnn;

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

  // Reflect the requested state immediately, including while Tone.start()
  // waits for the browser's AudioContext to become available.
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
  const helpBox = document.getElementById('help');
  helpBox.hidden = !helpBox.hidden;
}

function autoDrums() {
  const button = document.getElementById('btnAuto');

  if (button.hasAttribute('not-loaded')) {
    loadRNN();
    return;
  }

  button.disabled = true;
  const sequence = board.getSynthSequence();
  rnn.continueSequence(sequence, 16, 1.3)
    .then((dream) => {
      board.drawDreamSequence(dream, sequence);
      updateLocation();
    })
    .catch((error) => console.error('Unable to generate drums', error))
    .finally(() => {
      button.disabled = false;
    });
}

async function loadRNN() {
  const button = document.getElementById('btnAuto');
  button.textContent = 'Loading...';
  button.disabled = true;

  try {
    // Keep the ML runtime out of the initial audio bundle; the user opts in
    // to this larger download with the Load ML button.
    const {MusicRNN} = await import('@magenta/music/esm/music_rnn.js');
    rnn = new MusicRNN(
      'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/drum_kit_rnn',
    );
    await rnn.initialize();
    button.removeAttribute('not-loaded');
    button.textContent = 'Improvise!';
  } catch (error) {
    console.error('Unable to load the drum model', error);
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

// Keep the existing inline HTML controls working while the application code
// is loaded as an ES module.
Object.assign(window, {
  autoDrums,
  loadDemo,
  playDrums,
  playOrPause,
  playSynth,
  reset,
  showHelp,
});

window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    sequencer.dispose();
    audioEngine.dispose();
  }
});
