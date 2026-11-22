/** Wall and car-to-car collision resolution for the fixed-step simulation. */

import { CAR_RADIUS } from '../entities/Car.js';

const WALL_RESTITUTION = 0.38;
const CAR_RESTITUTION = 0.42;

export class PhysicsSystem {
  constructor(track, onImpact = () => {}) {
    this.track = track;
    this.onImpact = onImpact;
  }

  update(dt, cars) {
    for (const car of cars) {
      car.integrate(dt, car.controls, { onRoad: this.track.isOnRoad(car.x, car.y) });
    }

    for (const car of cars) {
      if (!car.noclip) this.resolveWall(car);
    }

    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        if (cars[i].noclip || cars[j].noclip) continue;
        this.resolvePair(cars[i], cars[j]);
      }
    }
  }

  resolveWall(car) {
    const near = this.track.nearest(car.x, car.y);
    const limit = near.halfWidth - CAR_RADIUS;
    const distance = Math.abs(near.signed);
    if (distance <= limit) return;

    const sign = Math.sign(near.signed) || 1;
    const nx = near.nx * sign;
    const ny = near.ny * sign;
    const overlap = distance - limit;
    car.x -= nx * overlap;
    car.y -= ny * overlap;

    const closing = car.vx * nx + car.vy * ny;
    if (closing <= 0) return;

    const impulse = (1 + WALL_RESTITUTION) * closing;
    car.vx -= impulse * nx;
    car.vy -= impulse * ny;

    const damage = car.applyDamage(Math.max(0, (closing - 65) / 9));
    this.onImpact({ car, strength: closing, x: car.x, y: car.y, damage, type: 'wall' });
  }

  resolvePair(a, b) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    const minDist = CAR_RADIUS * 2;
    if (dist >= minDist) return;
    if (dist < 0.0001) {
      dx = 1;
      dy = 0;
      dist = 0.0001;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    const massA = a.stats.mass;
    const massB = b.stats.mass;
    const totalMass = massA + massB;

    a.x -= nx * overlap * (massB / totalMass);
    a.y -= ny * overlap * (massB / totalMass);
    b.x += nx * overlap * (massA / totalMass);
    b.y += ny * overlap * (massA / totalMass);

    const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (closing >= 0) return;

    const impulse = (-(1 + CAR_RESTITUTION) * closing) / (1 / massA + 1 / massB);
    a.vx -= (impulse / massA) * nx;
    a.vy -= (impulse / massA) * ny;
    b.vx += (impulse / massB) * nx;
    b.vy += (impulse / massB) * ny;

    const raw = Math.max(0, -closing - 55) / 11;
    const damageA = a.applyDamage(raw);
    const damageB = b.applyDamage(raw);
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    this.onImpact({ car: a, strength: -closing, x, y, damage: damageA, type: 'car' });
    this.onImpact({ car: b, strength: -closing, x, y, damage: damageB, type: 'car' });
  }
}
