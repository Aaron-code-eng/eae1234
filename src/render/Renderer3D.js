/**
 * Software 3D renderer built on the 2D canvas context.
 *
 * No WebGL, no shaders, no textures: meshes and road strips are projected to
 * screen space, clipped against the near plane, depth-sorted and filled as
 * flat-shaded polygons with painter's algorithm.
 */

import { clamp, damp } from '../core/MathUtils.js';
import { CAR_TYPES } from '../entities/CarTypes.js';
import { Camera3D, clipNear, vec } from './Math3D.js';
import { Renderer } from './Renderer.js';

const SHADE_CACHE = new Map();

function shade(hex, factor) {
  const key = `${hex}:${factor}`;
  if (SHADE_CACHE.has(key)) return SHADE_CACHE.get(key);
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const channels = [0, 2, 4].map((i) => clamp(Math.round(parseInt(full.slice(i, i + 2), 16) * factor), 0, 255));
  const result = `rgb(${channels.join(',')})`;
  SHADE_CACHE.set(key, result);
  return result;
}

/** Push the six faces of an axis-aligned box (local space: +x forward). */
function addBox(faces, x1, x2, y1, y2, z1, z2, color, factors = {}) {
  const f = { top: 1, bottom: 0.45, front: 0.85, back: 0.6, side: 0.7, ...factors };
  const v = (x, y, z) => [x, y, z];
  faces.push({ verts: [v(x1, y2, z1), v(x2, y2, z1), v(x2, y2, z2), v(x1, y2, z2)], color: shade(color, f.top) });
  faces.push({ verts: [v(x1, y1, z1), v(x2, y1, z1), v(x2, y1, z2), v(x1, y1, z2)], color: shade(color, f.bottom) });
  faces.push({ verts: [v(x2, y1, z1), v(x2, y2, z1), v(x2, y2, z2), v(x2, y1, z2)], color: shade(color, f.front) });
  faces.push({ verts: [v(x1, y1, z1), v(x1, y2, z1), v(x1, y2, z2), v(x1, y1, z2)], color: shade(color, f.back) });
  faces.push({ verts: [v(x1, y1, z1), v(x2, y1, z1), v(x2, y2, z1), v(x1, y2, z1)], color: shade(color, f.side) });
  faces.push({ verts: [v(x1, y1, z2), v(x2, y1, z2), v(x2, y2, z2), v(x1, y2, z2)], color: shade(color, f.side) });
}

function buildMesh(type) {
  const faces = [];
  addBox(faces, -22, 22, 4, 14, -11, 11, type.color);
  addBox(faces, -10, 12, 14, 23, -8.5, 8.5, type.color);

  // Glass: windshield, rear window and side windows sit just outside the cabin.
  faces.push({ verts: [[12.1, 14, -8], [12.1, 14, 8], [6, 23.1, 8], [6, 23.1, -8]], color: 'rgba(18, 34, 50, 0.95)' });
  faces.push({ verts: [[-10.1, 23.1, -8], [-10.1, 23.1, 8], [-13, 14, 8], [-13, 14, -8]], color: 'rgba(18, 34, 50, 0.95)' });
  for (const side of [-1, 1]) {
    faces.push({ verts: [[-10, 14, side * 8.6], [12, 14, side * 8.6], [6, 23, side * 8.6], [-10, 23, side * 8.6]], color: 'rgba(20, 40, 58, 0.92)' });
  }

  faces.push({ verts: [[-18, 14.1, -2], [4, 14.1, -2], [4, 14.1, 2], [-18, 14.1, 2]], color: type.accent });
  for (const side of [-1, 1]) {
    const z1 = side < 0 ? -8 : 4;
    const z2 = side < 0 ? -4 : 8;
    faces.push({ verts: [[22.1, 8, z1], [22.1, 8, z2], [22.1, 12, z2], [22.1, 12, z1]], color: '#fff3c4' });
    faces.push({ verts: [[-22.1, 8, z1], [-22.1, 8, z2], [-22.1, 12, z2], [-22.1, 12, z1]], color: '#ff3b52' });
  }
  for (const wx of [-14, 14]) {
    for (const wz of [-12.5, 12.5]) {
      addBox(faces, wx - 6, wx + 6, 0, 9, wz - 2.5, wz + 2.5, '#0a0d13');
    }
  }
  if (type.spoiler) addBox(faces, -22, -17, 20, 23, -11, 11, '#151b27');
  return faces;
}

export class Renderer3D extends Renderer {
  constructor(canvas) {
    super(canvas);
    this.cam = new Camera3D();
    this.cam.setViewport(this.width, this.height);
    this.cameraMode = 'chase';
    this.camPos = null;
    this.camTarget = null;
    this.primitives = [];
    this.meshes = new Map();
  }

  // The base constructor calls resize() before subclass fields exist.
  resize() {
    super.resize();
    if (this.cam) this.cam.setViewport(this.width, this.height);
  }

  setCamera(mode) {
    if (!['chase', 'hood', 'top'].includes(mode)) return false;
    this.cameraMode = mode;
    this.camPos = null;
    return true;
  }

  cycleCamera() {
    const modes = ['chase', 'hood', 'top'];
    const next = modes[(modes.indexOf(this.cameraMode) + 1) % modes.length];
    return this.setCamera(next);
  }

  snapCamera() {
    this.camPos = null;
    this.camTarget = null;
  }

  updateCamera(game) {
    const car = game.player;
    if (!car) return;
    const dt = clamp(game.frameDt ?? 1 / 60, 0, 0.1);
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);

    let wantedPos;
    let wantedTarget;
    if (this.cameraMode === 'hood') {
      wantedPos = vec(car.x + c * 12, 24, car.y + s * 12);
      wantedTarget = vec(car.x + c * 240, 16, car.y + s * 240);
    } else if (this.cameraMode === 'top') {
      wantedPos = vec(car.x - c * 35, 300, car.y - s * 35);
      wantedTarget = vec(car.x + c * 45, 0, car.y + s * 45);
    } else {
      wantedPos = vec(car.x - c * 105, 52, car.y - s * 105);
      wantedTarget = vec(car.x + c * 125, 9, car.y + s * 125);
    }

    if (!this.camPos) {
      this.camPos = { ...wantedPos };
      this.camTarget = { ...wantedTarget };
    }
    const lambda = this.cameraMode === 'hood' ? 22 : 6;
    for (const axis of ['x', 'y', 'z']) {
      this.camPos[axis] = damp(this.camPos[axis], wantedPos[axis], lambda, dt);
      this.camTarget[axis] = damp(this.camTarget[axis], wantedTarget[axis], lambda, dt);
    }

    const shake = game.camera?.shake ?? 0;
    this.cam.position = shake > 0.05
      ? vec(
        this.camPos.x + (Math.random() - 0.5) * shake,
        this.camPos.y + (Math.random() - 0.5) * shake * 0.5,
        this.camPos.z + (Math.random() - 0.5) * shake,
      )
      : this.camPos;
    const dx = this.camTarget.x - this.camPos.x;
    const dy = this.camTarget.y - this.camPos.y;
    const dz = this.camTarget.z - this.camPos.z;
    this.cam.yaw = Math.atan2(dz, dx);
    this.cam.pitch = Math.atan2(-dy, Math.hypot(dx, dz));
    this.cam.updateBasis();
  }

  /* ------------------------------------------------------ primitives */
  queuePoly(vertices, color, alpha = 1) {
    const clip = this.cam.near + 0.01;
    let cameraPoints = vertices.map((v) => this.cam.toCamera(v));
    cameraPoints = clipNear(cameraPoints, clip);
    if (cameraPoints.length < 3) return;
    const points = cameraPoints.map((p) => this.cam.project(p)).filter(Boolean);
    if (points.length < 3) return;
    const depth = cameraPoints.reduce((sum, p) => sum + p.z, 0) / cameraPoints.length;
    this.primitives.push({ type: 'poly', points, color, alpha, depth });
  }

  queueLine(a, b, color, width = 1, alpha = 1) {
    const near = this.cam.near + 0.01;
    let ca = this.cam.toCamera(a);
    let cb = this.cam.toCamera(b);
    if (ca.z < near && cb.z < near) return;
    if (ca.z < near) {
      const t = (near - ca.z) / (cb.z - ca.z);
      ca = vec(ca.x + (cb.x - ca.x) * t, ca.y + (cb.y - ca.y) * t, near);
    } else if (cb.z < near) {
      const t = (near - cb.z) / (ca.z - cb.z);
      cb = vec(cb.x + (ca.x - cb.x) * t, cb.y + (ca.y - cb.y) * t, near);
    }
    const p1 = this.cam.project(ca);
    const p2 = this.cam.project(cb);
    if (!p1 || !p2) return;
    this.primitives.push({ type: 'line', points: [p1, p2], color, width, alpha, depth: (ca.z + cb.z) / 2 });
  }

  queueSprite(position, size, color, alpha = 1) {
    const cameraPoint = this.cam.toCamera(position);
    const point = this.cam.project(cameraPoint);
    if (!point) return;
    this.primitives.push({
      type: 'sprite',
      x: point.x,
      y: point.y,
      size: clamp((size * this.cam.focal) / cameraPoint.z, 0.5, 90),
      color,
      alpha,
      depth: cameraPoint.z,
    });
  }

  /* ---------------------------------------------------------- world */
  queueEnvironment() {
    const extent = 5200;
    this.queuePoly([
      vec(-extent, 0, -extent), vec(extent, 0, -extent),
      vec(extent, 0, extent), vec(-extent, 0, extent),
    ], '#101725');

    for (let i = -12; i <= 12; i++) {
      const at = i * 200;
      this.queueLine(vec(at, 0.05, -2400), vec(at, 0.05, 2400), '#557099', 1, 0.1);
      this.queueLine(vec(-2400, 0.05, at), vec(2400, 0.05, at), '#557099', 1, 0.1);
    }
  }

  queueTrack(game) {
    const track = game.track;
    const points = track.points;
    const halfWidth = track.halfWidth;
    const pointAt = (point, offset, height) =>
      vec(point.x - point.ty * offset, height, point.y + point.tx * offset);

    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];

      this.queuePoly([
        pointAt(a, -halfWidth - 24, 0.01), pointAt(b, -halfWidth - 24, 0.01),
        pointAt(b, halfWidth + 24, 0.01), pointAt(a, halfWidth + 24, 0.01),
      ], '#0b1220');

      const curb = Math.floor(i / 3) % 2 === 0 ? '#e25662' : '#e9f0f7';
      this.queuePoly([
        pointAt(a, -halfWidth - 10, 0.06), pointAt(b, -halfWidth - 10, 0.06),
        pointAt(b, -halfWidth, 0.06), pointAt(a, -halfWidth, 0.06),
      ], curb);
      this.queuePoly([
        pointAt(a, halfWidth, 0.06), pointAt(b, halfWidth, 0.06),
        pointAt(b, halfWidth + 10, 0.06), pointAt(a, halfWidth + 10, 0.06),
      ], curb);

      this.queuePoly([
        pointAt(a, -halfWidth, 0.04), pointAt(b, -halfWidth, 0.04),
        pointAt(b, halfWidth, 0.04), pointAt(a, halfWidth, 0.04),
      ], '#28303f');

      if (i % 6 < 3) {
        this.queuePoly([
          pointAt(a, -1.5, 0.09), pointAt(b, -1.5, 0.09),
          pointAt(b, 1.5, 0.09), pointAt(a, 1.5, 0.09),
        ], 'rgba(255, 255, 255, 0.22)');
      }
    }

    // Checkered start/finish band.
    const start = points[0];
    const along = points[3];
    const columns = 8;
    const cell = (halfWidth * 2) / columns;
    for (let row = 0; row < 2; row++) {
      const t1 = row * 0.09;
      const t2 = (row + 1) * 0.09;
      const a = { ...start, x: start.x + (along.x - start.x) * t1, y: start.y + (along.y - start.y) * t1 };
      const b = { ...start, x: start.x + (along.x - start.x) * t2, y: start.y + (along.y - start.y) * t2 };
      for (let col = 0; col < columns; col++) {
        this.queuePoly([
          pointAt(a, -halfWidth + col * cell, 0.12),
          pointAt(b, -halfWidth + col * cell, 0.12),
          pointAt(b, -halfWidth + (col + 1) * cell, 0.12),
          pointAt(a, -halfWidth + (col + 1) * cell, 0.12),
        ], (col + row) % 2 === 0 ? '#f2f6fb' : '#111722');
      }
    }

    if (game.race.mode === 'race' && game.race.state !== 'finished' && game.player) {
      const gate = track.checkpoints[game.player.nextCheckpoint % track.checkpoints.length];
      this.queuePoly([
        pointAt(gate, -halfWidth + 8, 0.14), pointAt(gate, halfWidth - 8, 0.14),
        pointAt({ ...gate, x: gate.x + gate.tx * 6, y: gate.y + gate.ty * 6 }, halfWidth - 8, 0.14),
        pointAt({ ...gate, x: gate.x + gate.tx * 6, y: gate.y + gate.ty * 6 }, -halfWidth + 8, 0.14),
      ], 'rgba(86, 224, 255, 0.4)');
    }
  }

  queueSkids(game) {
    for (const mark of game.skids.items) {
      const dx = mark.x2 - mark.x1;
      const dy = mark.y2 - mark.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const width = mark.width / 2;
      const alpha = clamp(mark.life / game.skids.lifetime, 0, 1) * 0.5;
      this.queuePoly([
        vec(mark.x1 + nx * width, 0.16, mark.y1 + ny * width),
        vec(mark.x2 + nx * width, 0.16, mark.y2 + ny * width),
        vec(mark.x2 - nx * width, 0.16, mark.y2 - ny * width),
        vec(mark.x1 - nx * width, 0.16, mark.y1 - ny * width),
      ], '#05070b', alpha);
    }
  }

  queueCars(game) {
    for (const car of game.cars) {
      const type = CAR_TYPES[car.typeId] ?? CAR_TYPES.starter;
      if (!this.meshes.has(type.id)) this.meshes.set(type.id, buildMesh(type));
      const faces = this.meshes.get(type.id);
      const c = Math.cos(car.angle);
      const s = Math.sin(car.angle);
      const world = ([lx, ly, lz]) => vec(
        car.x + lx * c - lz * s,
        ly,
        car.y + lx * s + lz * c,
      );

      for (const face of faces) this.queuePoly(face.verts.map(world), face.color);

      if (car.impactFlash > 0) {
        this.queuePoly([
          world([-22, 14.3, -11]), world([22, 14.3, -11]),
          world([22, 14.3, 11]), world([-22, 14.3, 11]),
        ], '#ffffff', car.impactFlash * 0.35);
      }
      if (car.isPlayer) this.queueRing(car, 30, 'rgba(86, 224, 255, 0.5)');
    }
  }

  queueRing(car, radius, color) {
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      this.queueLine(
        vec(car.x + Math.cos(a1) * radius, 0.2, car.y + Math.sin(a1) * radius),
        vec(car.x + Math.cos(a2) * radius, 0.2, car.y + Math.sin(a2) * radius),
        color, 2, 0.6,
      );
    }
  }

  queueParticles(game) {
    for (const p of game.particles.items) {
      const height = p.type === 'dust' ? 2 : p.type === 'spark' ? 8 : 6;
      const alpha = clamp(p.life / p.maxLife, 0, 1) * (p.type === 'spark' ? 0.95 : 0.55);
      this.queueSprite(vec(p.x, height, p.y), p.size, p.color, alpha);
    }
  }

  /* ---------------------------------------------------------- output */
  render(game) {
    this.updateCamera(game);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, this.width, this.height);

    this.primitives.length = 0;
    this.queueEnvironment();
    this.queueTrack(game);
    this.queueSkids(game);
    this.queueCars(game);
    this.queueParticles(game);
    this.primitives.sort((a, b) => b.depth - a.depth);

    for (const item of this.primitives) {
      ctx.globalAlpha = item.alpha;
      if (item.type === 'poly') {
        ctx.beginPath();
        ctx.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++) ctx.lineTo(item.points[i].x, item.points[i].y);
        ctx.closePath();
        ctx.fillStyle = item.color;
        ctx.fill();
      } else if (item.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(item.points[0].x, item.points[0].y);
        ctx.lineTo(item.points[1].x, item.points[1].y);
        ctx.lineWidth = item.width;
        ctx.strokeStyle = item.color;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.size, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
