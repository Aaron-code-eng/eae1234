/** Track geometry: Catmull-Rom centerline, collision boundaries and gates. */

import { clamp, distance } from '../core/MathUtils.js';

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const coord = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: coord(p0.x, p1.x, p2.x, p3.x), y: coord(p0.y, p1.y, p2.y, p3.y) };
}

function buildCenterline(controlPoints, samplesPerSegment) {
  const control = controlPoints.map(([x, y]) => ({ x, y }));
  const count = control.length;
  const points = [];

  for (let i = 0; i < count; i++) {
    const p0 = control[(i - 1 + count) % count];
    const p1 = control[i];
    const p2 = control[(i + 1) % count];
    const p3 = control[(i + 2) % count];
    for (let step = 0; step < samplesPerSegment; step++) {
      points.push(catmullRom(p0, p1, p2, p3, step / samplesPerSegment));
    }
  }

  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    let dx = next.x - points[i].x;
    let dy = next.y - points[i].y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    points[i].tx = dx;
    points[i].ty = dy;
    points[i].s = i === 0 ? 0 : points[i - 1].s + distance(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }

  return points;
}

export class Track {
  constructor(definition, samplesPerSegment = 12) {
    this.id = definition.id;
    this.name = definition.name;
    this.width = definition.width;
    this.points = buildCenterline(definition.points, samplesPerSegment);
    this.halfWidth = this.width / 2;
    this.length = this.points[this.points.length - 1].s +
      distance(this.points.at(-1).x, this.points.at(-1).y, this.points[0].x, this.points[0].y);

    const gateCount = definition.checkpoints ?? 8;
    const n = this.points.length;
    this.checkpoints = Array.from({ length: gateCount }, (_, index) => {
      const point = this.points[Math.floor((index * n) / gateCount) % n];
      return { x: point.x, y: point.y, tx: point.tx, ty: point.ty, index };
    });
  }

  /** Closest point on the centerline, with signed distance from it. */
  nearest(x, y) {
    const points = this.points;
    let best = { d2: Infinity, index: 0, t: 0, px: 0, py: 0, tx: 1, ty: 0 };

    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / len2, 0, 1);
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const d2 = (x - px) ** 2 + (y - py) ** 2;
      if (d2 < best.d2) {
        const length = Math.sqrt(len2);
        best = { d2, index: i, t, px, py, tx: dx / length, ty: dy / length };
      }
    }

    const nx = -best.ty;
    const ny = best.tx;
    return {
      ...best,
      dist: Math.sqrt(best.d2),
      nx,
      ny,
      signed: (x - best.px) * nx + (y - best.py) * ny,
      halfWidth: this.halfWidth,
    };
  }

  isOnRoad(x, y, margin = 0) {
    return this.nearest(x, y).dist <= this.halfWidth + margin;
  }

  /** Normalised progress around the loop, used for standings. */
  progress(x, y) {
    const near = this.nearest(x, y);
    return (near.index + near.t) / this.points.length;
  }

  /** Start-grid slot behind the start/finish gate. */
  gridPosition(slot) {
    const start = this.points[0];
    const nx = -start.ty;
    const ny = start.tx;
    const row = Math.floor(slot / 2);
    const side = slot % 2 === 0 ? -1 : 1;
    const back = 70 + row * 96;
    const offset = side * this.halfWidth * 0.42;
    return {
      x: start.x - start.tx * back + nx * offset,
      y: start.y - start.ty * back + ny * offset,
      angle: Math.atan2(start.ty, start.tx),
    };
  }
}
