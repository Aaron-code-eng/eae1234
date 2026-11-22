/** Lightweight racing-line follower with per-driver skill and drift flair. */

import { angleDiff, clamp, wrapAngle } from '../core/MathUtils.js';

export class AIDriver {
  constructor(car, track, skill = 0.92) {
    this.car = car;
    this.track = track;
    this.skill = skill;
    this.phase = Math.random() * 10;
  }

  update(dt) {
    const { car, track } = this;
    const count = track.points.length;
    const near = track.nearest(car.x, car.y);
    const lookAhead = Math.round(5 + clamp(car.speed / 70, 0, 14));

    const target = track.points[(near.index + lookAhead) % count];
    const future = track.points[(near.index + lookAhead * 2) % count];
    const desired = Math.atan2(target.y - car.y, target.x - car.x);
    const curvature = Math.abs(
      wrapAngle(Math.atan2(future.ty, future.tx) - Math.atan2(target.ty, target.tx)),
    );

    let steer = clamp(angleDiff(car.angle, desired) * 2.6, -1, 1);
    const targetSpeed = car.stats.topSpeed * clamp(1 - curvature * 1.6, 0.34, 1) * this.skill;
    let throttle = car.speed < targetSpeed ? 1 : 0;
    let brake = car.speed > targetSpeed * 1.12 ? 0.7 : 0;
    let handbrake = car.typeId === 'drift' && curvature > 0.55 && car.speed > 230;
    let nitro = curvature < 0.05 && car.speed > targetSpeed * 0.65 &&
      car.nitro > car.stats.nitroCapacity * 0.25;

    // Recover toward the centerline if pushed wide or off the track.
    if (Math.abs(near.signed) > track.halfWidth - 24) {
      const center = track.points[near.index];
      steer = clamp(angleDiff(car.angle, Math.atan2(center.y - car.y, center.x - car.x)) * 2.2, -1, 1);
      throttle = 0.6;
      brake = 0;
      handbrake = false;
      nitro = false;
    }

    this.phase += dt;
    steer = clamp(steer + Math.sin(this.phase * 1.7) * 0.025, -1, 1);
    car.controls = { throttle, brake, steer, handbrake, nitro };
  }
}
