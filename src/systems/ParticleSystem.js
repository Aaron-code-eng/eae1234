/** Short-lived visual effects and persistent skid marks. Pure data only. */

import { rand } from '../core/MathUtils.js';

export class ParticleSystem {
  constructor(limit = 700) {
    this.limit = limit;
    this.items = [];
  }

  spawn(type, x, y, options = {}) {
    if (this.items.length >= this.limit) this.items.shift();
    this.items.push({
      type,
      x,
      y,
      vx: options.vx ?? 0,
      vy: options.vy ?? 0,
      life: options.life ?? 1,
      maxLife: options.life ?? 1,
      size: options.size ?? 4,
      grow: options.grow ?? 0,
      color: options.color ?? '#ffffff',
      drag: options.drag ?? 1.5,
    });
  }

  burst(type, x, y, count, options = {}) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(options.minSpeed ?? 40, options.maxSpeed ?? 180);
      this.spawn(type, x, y, {
        ...options,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand((options.life ?? 0.6) * 0.6, options.life ?? 0.6),
      });
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      p.vx *= Math.exp(-p.drag * dt);
      p.vy *= Math.exp(-p.drag * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
  }

  clear() {
    this.items.length = 0;
  }
}

export class SkidMarks {
  constructor(limit = 1100, lifetime = 13) {
    this.limit = limit;
    this.lifetime = lifetime;
    this.items = [];
  }

  add(x1, y1, x2, y2, width = 5) {
    if (this.items.length >= this.limit) this.items.shift();
    this.items.push({ x1, y1, x2, y2, width, life: this.lifetime });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.items[i].life -= dt;
      if (this.items[i].life <= 0) this.items.splice(i, 1);
    }
  }

  clear() {
    this.items.length = 0;
  }

  /** Draw each fading mark as a short dark line segment on the 2D canvas. */
  draw(ctx) {
    ctx.lineCap = 'round';
    for (const mark of this.items) {
      ctx.globalAlpha = Math.max(0, mark.life / this.lifetime) * 0.45;
      ctx.strokeStyle = '#05070b';
      ctx.lineWidth = mark.width;
      ctx.beginPath();
      ctx.moveTo(mark.x1, mark.y1);
      ctx.lineTo(mark.x2, mark.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
