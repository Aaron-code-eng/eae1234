/** Smooth follow camera with screen-space impact shake. */

import { damp } from '../core/MathUtils.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 0.85;
    this.shake = 0;
  }

  snapTo(x, y) {
    this.x = x;
    this.y = y;
    this.shake = 0;
  }

  follow(car, dt) {
    this.x = damp(this.x, car.x + car.vx * 0.18, 6, dt);
    this.y = damp(this.y, car.y + car.vy * 0.18, 6, dt);
    this.shake = damp(this.shake, 0, 7, dt);
  }

  addShake(amount) {
    this.shake = Math.min(20, this.shake + amount);
  }

  apply(ctx, width, height) {
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.translate(width / 2 + sx, height / 2 + sy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}
