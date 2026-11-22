/** All drawing uses the 2D canvas context - there is no WebGL code here. */

import { clamp } from '../core/MathUtils.js';
import { CAR_TYPES } from '../entities/CarTypes.js';

const COLORS = {
  ground: '#080c14',
  grid: 'rgba(120, 160, 210, 0.05)',
  shoulder: '#0b1220',
  edge: '#151e30',
  asphalt: '#262e3c',
  inner: 'rgba(255, 255, 255, 0.025)',
  centerLine: 'rgba(255, 255, 255, 0.2)',
};

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this.minimapCache = new Map();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || window.innerWidth);
    this.height = Math.max(1, rect.height || window.innerHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  render(game) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    game.camera.apply(ctx, this.width, this.height);
    this.drawGrid(ctx, game.camera);
    this.drawTrack(ctx, game.track, game);
    game.skids.draw(ctx);
    this.drawParticles(ctx, game.particles, 'behind');
    for (const car of game.cars) this.drawCar(ctx, car);
    this.drawParticles(ctx, game.particles, 'front');
    ctx.restore();
  }

  drawGrid(ctx, camera) {
    const halfW = this.width / (2 * camera.zoom) + 100;
    const halfH = this.height / (2 * camera.zoom) + 100;
    const left = Math.floor((camera.x - halfW) / 120) * 120;
    const right = camera.x + halfW;
    const top = Math.floor((camera.y - halfH) / 120) * 120;
    const bottom = camera.y + halfH;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = left; x <= right; x += 120) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = top; y <= bottom; y += 120) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
  }

  trackPath(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
  }

  drawTrack(ctx, track, game) {
    const points = track.points;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    this.trackPath(ctx, points);
    ctx.lineWidth = track.width + 36;
    ctx.strokeStyle = COLORS.shoulder;
    ctx.stroke();

    this.drawCurbs(ctx, track);

    this.trackPath(ctx, points);
    ctx.lineWidth = track.width;
    ctx.strokeStyle = COLORS.asphalt;
    ctx.stroke();

    ctx.lineWidth = track.width - 20;
    ctx.strokeStyle = COLORS.inner;
    ctx.stroke();

    ctx.setLineDash([24, 36]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.centerLine;
    ctx.stroke();
    ctx.setLineDash([]);

    this.drawStartLine(ctx, track);
    this.drawNextGate(ctx, track, game);
  }

  drawCurbs(ctx, track) {
    const points = track.points;
    const step = 3;
    const length = 26;
    for (let i = 0; i < points.length; i += step) {
      const point = points[i];
      const angle = Math.atan2(point.ty, point.tx);
      const color = Math.floor(i / step) % 2 === 0 ? '#e25662' : '#e9f0f7';
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      const edge = track.halfWidth + 5;
      ctx.fillRect(-length / 2, -edge - 9, length, 9);
      ctx.fillRect(-length / 2, edge, length, 9);
      ctx.restore();
    }
  }

  drawStartLine(ctx, track) {
    const start = track.points[0];
    const columns = 8;
    const cell = track.width / columns;
    const depth = 18;
    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(Math.atan2(start.ty, start.tx));
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < columns; i++) {
        ctx.fillStyle = (i + row) % 2 === 0 ? '#f2f6fb' : '#111722';
        ctx.fillRect(-depth / 2 + (row * depth) / 2, -track.halfWidth + i * cell, depth / 2, cell);
      }
    }
    ctx.restore();
  }

  drawNextGate(ctx, track, game) {
    if (game.race.mode !== 'race' || game.race.state === 'finished' || !game.player) return;
    const gates = track.checkpoints;
    const gate = gates[game.player.nextCheckpoint % gates.length];
    ctx.save();
    ctx.translate(gate.x, gate.y);
    ctx.rotate(Math.atan2(gate.ty, gate.tx));
    ctx.strokeStyle = 'rgba(86, 224, 255, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -track.halfWidth + 10);
    ctx.lineTo(0, track.halfWidth - 10);
    ctx.stroke();
    ctx.restore();
  }

  drawParticles(ctx, particles, layer) {
    for (const p of particles.items) {
      const behind = p.type === 'smoke' || p.type === 'dust';
      if ((layer === 'behind') !== behind) continue;
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha * (p.type === 'spark' ? 1 : 0.55);
      if (p.type === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawCar(ctx, car) {
    const type = CAR_TYPES[car.typeId] ?? CAR_TYPES.starter;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    roundedRect(ctx, -20, -9, 46, 28, 8);
    ctx.fill();

    for (const [wx, wy, front] of [[13, -12, true], [13, 12, true], [-13, -12, false], [-13, 12, false]]) {
      ctx.save();
      ctx.translate(wx, wy);
      if (front) ctx.rotate(car.steerVisual * 0.45);
      ctx.fillStyle = '#080b11';
      roundedRect(ctx, -6, -3.2, 12, 6.4, 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = type.color;
    roundedRect(ctx, -22, -11, 44, 22, 6);
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    roundedRect(ctx, -19, -8, 30, 16, 4);
    ctx.fill();

    ctx.fillStyle = type.accent;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(-19, -1.8, 17, 3.6);
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(8, 16, 28, 0.88)';
    ctx.beginPath();
    ctx.moveTo(1, -8);
    ctx.lineTo(11, -7);
    ctx.lineTo(11, 7);
    ctx.lineTo(1, 8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-1, -7.5);
    ctx.lineTo(-8, -7);
    ctx.lineTo(-8, 7);
    ctx.lineTo(-1, 7.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff3c4';
    ctx.fillRect(19, -8, 3, 5);
    ctx.fillRect(19, 3, 5, 5);
    ctx.fillStyle = car.controls.brake > 0 || car.controls.handbrake ? '#ff3b52' : '#912432';
    ctx.fillRect(-22, -8, 3, 5);
    ctx.fillRect(-22, 3, 3, 5);

    if (type.spoiler) {
      ctx.fillStyle = '#111722';
      ctx.fillRect(-21, -14, 7, 3);
      ctx.fillRect(-21, 11, 7, 3);
      ctx.fillRect(-19, -12, 2, 5);
      ctx.fillRect(-19, 7, 2, 5);
    }

    if (car.health < 55) {
      ctx.strokeStyle = 'rgba(10, 10, 14, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.lineTo(-2, -3);
      ctx.lineTo(-8, 1);
      ctx.moveTo(7, 9);
      ctx.lineTo(3, 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 90, 70, 0.4)';
      ctx.fillRect(-19, -10, 5, 3);
    }

    if (car.impactFlash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${car.impactFlash * 0.35})`;
      roundedRect(ctx, -22, -11, 44, 22, 6);
      ctx.fill();
    }

    ctx.restore();

    if (car.isPlayer) {
      ctx.strokeStyle = 'rgba(86, 224, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 29, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  minimapBounds(track) {
    if (this.minimapCache.has(track.id)) return this.minimapCache.get(track.id);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of track.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    const bounds = { minX: minX - 120, maxX: maxX + 120, minY: minY - 120, maxY: maxY + 120 };
    this.minimapCache.set(track.id, bounds);
    return bounds;
  }

  drawMinimap(ctx, track, cars, width, height) {
    ctx.clearRect(0, 0, width, height);
    const bounds = this.minimapBounds(track);
    const scale = Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY));
    const offsetX = (width - (bounds.maxX - bounds.minX) * scale) / 2;
    const offsetY = (height - (bounds.maxY - bounds.minY) * scale) / 2;
    const project = (x, y) => ({
      x: offsetX + (x - bounds.minX) * scale,
      y: offsetY + (y - bounds.minY) * scale,
    });

    ctx.beginPath();
    track.points.forEach((point, index) => {
      const p = project(point.x, point.y);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.strokeStyle = '#3a475d';
    ctx.lineWidth = Math.max(3, track.width * scale);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (const car of cars) {
      const p = project(car.x, car.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, car.isPlayer ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = car.isPlayer ? '#56e0ff' : (CAR_TYPES[car.typeId]?.color ?? '#fff');
      ctx.fill();
    }
  }

}
