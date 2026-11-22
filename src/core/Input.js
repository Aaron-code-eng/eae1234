/** Keyboard state with edge detection, independent of DOM-heavy UI code. */

const PREVENT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'ShiftLeft', 'ShiftRight', 'Tab', 'Backquote',
]);

function isEditable(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set();
    this.enabled = true;

    this._onKeyDown = (event) => {
      if (isEditable(event.target)) return;
      if (PREVENT.has(event.code)) event.preventDefault();
      if (!this.down.has(event.code)) this.pressed.add(event.code);
      this.down.add(event.code);
    };
    this._onKeyUp = (event) => {
      if (isEditable(event.target)) return;
      this.down.delete(event.code);
    };
    this._onBlur = () => {
      this.down.clear();
      this.pressed.clear();
    };

    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('blur', this._onBlur);
    this.target = target;
  }

  isDown(code) {
    return this.enabled && this.down.has(code);
  }

  /** True once per physical key press. */
  consumePress(code) {
    const hit = this.pressed.has(code);
    this.pressed.delete(code);
    return hit && this.enabled;
  }

  /** Must be called at the end of every rendered frame. */
  endFrame() {
    this.pressed.clear();
  }

  /** Driving controls for the player car. */
  driveControls() {
    const throttle = this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0;
    const brake = this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0;
    const left = this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0;
    const right = this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0;
    return {
      throttle,
      brake,
      steer: right - left,
      handbrake: this.isDown('Space'),
      nitro: this.isDown('ShiftLeft') || this.isDown('ShiftRight'),
    };
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.target.removeEventListener('blur', this._onBlur);
  }
}
