/***********************************
 * Board of dots
 ***********************************/
export class Board {
  constructor() {
    this.data = [];
    this.ripples = [];
    this.ui = {}; // gets populated by this.reset();
    
    this.reset();
    
    this.isPlaying = false;
  }
  
  reset() {
    this.data = [];
    this.ui.container = document.getElementById('container');
    this.ui.container.innerHTML = '';
    
    for (let i = 0; i < 16; i++) {
      this.data.push([]);
      const rowEl = document.createElement('div');
      rowEl.classList.add('row');
      this.ui.container.appendChild(rowEl);
      
      for (let j = 0; j < 16; j++) {
        this.data[i][j] = {};
        const button = document.createElement('button');
        button.setAttribute('aria-label', 'cell, empty');
        button.classList.add('pixel');
        button.dataset.row = i;
        button.dataset.col = j;
        rowEl.appendChild(button);
      }
    }
    
    this.ui.rows = document.querySelectorAll('.container > .row');
    this.draw();
  }
  
  // Toggles a particular dot from on to off.
  toggleCell(i,j, sound, uiButton) {
    const dot = this.data[i][j];
    if (dot.on) {
      dot.on = 0;
    } else {
      dot.on = sound;
    }
    
    uiButton.setAttribute('aria-label', sound === 1 ? 'cell, synth' : 'cell, drums');
    this.draw();
  }
  
  // Take the toggled synth notes so that Magenta can dream up some drums.
  getSynthSequence() {
    const sequence = {notes:[], quantizationInfo: {stepsPerQuarter: 4}};
    
    const drumPitches = [36, 38, 42, 46, 45, 48, 50, 49, 51, 35, 27, 29, 47, 55, 52, 44];
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        // Found a synth note!
        if (this.data[i][j].on === 1) {
          sequence.notes.push(
            {pitch: drumPitches[i], quantizedStartStep: j, isDrum: true, quantizedEndStep: j + 1},
          );
        }
        // If it's a drum note, delete it pre-emptively.
        if (this.data[i][j].on === 2) {
          this.data[i][j].on = 0;
        }
      }
    }
    
    return sequence;
  }
  
  drawDreamSequence(sequence, originalSequence) {
    if (JSON.stringify(sequence.notes) === JSON.stringify(originalSequence.notes)) {
      console.log('Something mysterious went wrong, bailing');
    }
    
    const drumPitches = [36, 38, 42, 46, 45, 48, 50, 49, 51, 35, 27, 29, 47, 55, 52, 44];
    const numOtherPitches = 7;
    for (let i = 0; i < sequence.notes.length; i++) {
      // A note is an object like this: {pitch: 36, quantizedStartStep: 1, quantizedEndStep: 2, isDrum: true}
      
      const note = sequence.notes[i];      
      const col = note.quantizedStartStep;
      
      // Note: I've noticed that the RNN always returns the base pitches, so one of the 0-9 pitches
      // This means that we'd never generate any random sounds on the bottom of the board, so
      // flip a coin and sometimes randomly, pick from the bottom sounds for the same kind of drum.
      // You know, keep it intresting.
      let row = drumPitches.indexOf(note.pitch);
      if (row < numOtherPitches && Math.random() < 0.5) {
        row += numOtherPitches;
      }
      
      if (row !== -1) {
        // Don't draw on top of a synth tho
        if (this.data[row][col].on !== 1) {
          this.data[row][col].on = 2;
        }
      }
    }
    this.draw();
  }
  
  // Paints the current state of the world.
  draw() {
    this._updateRipples();
    
    for (let i = 0; i < 16; i++) {
      const pixels = this.ui.rows[i].querySelectorAll('.pixel');
      
      for (let j = 0; j < 16; j++) {
        // Maybe it's a sound?
        if (this._paintSoundCell(this.data[i][j], pixels[j])) {
          continue;
        }
        // Maybe it's part of a ripple?
        this._paintRippleCell(pixels[j], i, j);
      }
    }
  }
  
  // Paint the column at the audio event's scheduled time. Audio is scheduled
  // separately by AudioEngine so DOM work cannot delay note attacks.
  animate(currentColumn) {
    for (let i = 0; i < 16; i++) {
      const pixels = this.ui.rows[i].querySelectorAll('.pixel');
      this._clearPreviousAnimation(pixels);
      
      const sound = this.data[i][currentColumn].on;
      if (sound) {
        this.ripples.push({x: i, y: currentColumn, distance: 0, sound});
        pixels[currentColumn].classList.add('active');
      } else {
        pixels[currentColumn].classList.add('bar');
      }
    }
    this.draw();
  }
  
  // Remove animation artifacts like the green bar line and the ripples.
  clearAnimation() {
    this.ripples = [];
    const bars = this.ui.container.querySelectorAll('.bar');
    const rips = this.ui.container.querySelectorAll('.ripple');
    const actives = this.ui.container.querySelectorAll('.active');
    
    for (let bar of bars) {
      bar.classList.remove('bar');
    }
    for (let rip of rips) {
      rip.classList.remove('ripple');
    } 
    for (let active of actives) {
      active.classList.remove('active');
    } 
  }
  
  _clearPreviousAnimation(row) {
    for (let j = 0; j < 16; j++) {
      row[j].classList.remove('bar');
      row[j].classList.remove('active');
    }
  }
  
  _updateRipples() {
    for (let i = 0; i < this.ripples.length; i++) {
      // If the ripples it too big, nuke it.
      if (this.ripples[i].distance > 6) {
          this.ripples.splice(i, 1);
      } else {
        this.ripples[i].distance += 1;
      }
    }
  }
  
   // Displays the right sound on a UI cell, if it's on.
  _paintSoundCell(dataCell, uiCell) {
    let didIt = false;
    if (dataCell.on) {
      uiCell.classList.add('on');
      
      // You may have clicked on this when it was part of a ripple.
      uiCell.classList.remove('ripple');
      
      // Display the correct sound.
      uiCell.classList.remove('drums');
      uiCell.classList.remove('synth');
      uiCell.classList.add(dataCell.on === 1 ? 'synth' : 'drums');
      didIt = true;
    } else {
      uiCell.classList.remove('on');
    }
    return didIt;
  }
  
  _paintRippleCell(uiCell, i, j) {
    // Clear the old ripple, if it exists.
    uiCell.classList.remove('ripple');

    // Is this pixel inside a ripple?
    for(let r = 0; r < this.ripples.length; r++) {
      const ripple = this.ripples[r];
      
      // Math. We basically want to draw a donut around the ripple center.
      // A distance is sqrt[(x1-x2)^2 + (y1-y2)^2]
      let distanceFromRippleCenter = Math.sqrt((i-ripple.x)*(i-ripple.x) + (j-ripple.y)*(j-ripple.y));
      
      // If you're in this magical donut with magical numbers I crafted
      // by hand, then congratulations: you're a ripple cell!
      if(distanceFromRippleCenter > ripple.distance - 0.7 && 
         distanceFromRippleCenter < ripple.distance + 0.7 &&
         distanceFromRippleCenter < 3.5) {
        uiCell.classList.add('ripple');
        uiCell.classList.add(ripple.sound === 1 ? 'synth' : 'drums');
      }
    }
  }
}