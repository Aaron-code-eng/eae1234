/** Arcade car physics: longitudinal drive, lateral grip, drift and damage. */

import { approach, clamp, damp, dot, wrapAngle } from '../core/MathUtils.js';

export const CAR_RADIUS = 17;

export class Car {
  constructor({ id, typeId, name, stats, x = 0, y = 0, angle = 0, isPlayer = false }) {
    this.id = id;
    this.typeId = typeId;
    this.name = name;
    this.stats = stats;
    this.isPlayer = isPlayer;

    this.x = x;
    this.y = y;
    this.angle = angle;
    this.prevX = x;
    this.prevY = y;
    this.vx = 0;
    this.vy = 0;

    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.steerVisual = 0;
    this.health = 100;
    this.nitro = stats.nitroCapacity;
    this.drift = 0;
    this.driftScore = 0;
    this.driftTimer = 0;
    this.driftCombo = 1;
    this.impactFlash = 0;

    this.lap = 0;
    this.nextCheckpoint = 1;
    this.finished = false;
    this.finishTime = null;
    this.bestLap = null;
    this.lapStartTime = 0;
    this.rank = 1;

    this.god = false;
    this.noclip = false;
    this.infiniteNitro = false;
    this.ai = null;

    this.lastSkid = null;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  get kmh() {
    return Math.round(this.speed * 0.42);
  }

  get damaged() {
    return this.health < 55;
  }

  /** Reset everything needed for a race start. */
  prepareForRace(x, y, angle) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.angle = angle;
    this.vx = this.vy = 0;
    this.health = 100;
    this.nitro = this.stats.nitroCapacity;
    this.drift = 0;
    this.driftScore = 0;
    this.driftTimer = 0;
    this.driftCombo = 1;
    this.lap = 0;
    this.nextCheckpoint = 1;
    this.finished = false;
    this.finishTime = null;
    this.bestLap = null;
    this.lapStartTime = 0;
    this.lastSkid = null;
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
  }

  /** Put the car back on the racing line after a crash. */
  respawn(track) {
    const near = track.nearest(this.x, this.y);
    this.x = this.prevX = near.px;
    this.y = this.prevY = near.py;
    this.angle = Math.atan2(near.ty, near.tx);
    this.vx = this.vy = 0;
    this.drift = 0;
    this.lastSkid = null;
    this.health = Math.max(this.health, 40);
  }

  applyDamage(amount) {
    if (this.god || amount <= 0) return 0;
    const dealt = amount * (1 - this.stats.armor);
    this.health = clamp(this.health - dealt, 0, 100);
    this.impactFlash = 1;
    return dealt;
  }

  /** Integrate one fixed physics step. `surface.onRoad` controls off-road penalties. */
  integrate(dt, controls, surface = {}) {
    const c = controls ?? this.controls;
    const s = this.stats;
    this.controls = c;
    this.prevX = this.x;
    this.prevY = this.y;

    // Basis vectors from the CURRENT heading. Velocity is recombined in this
    // same basis, so the car rotates into its velocity over time instead of
    // teleporting its momentum - that lag is what creates drifts.
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const rx = -fy;
    const ry = fx;
    let forward = dot(this.vx, this.vy, fx, fy);
    let lateral = dot(this.vx, this.vy, rx, ry);

    const onRoad = surface.onRoad !== false;
    const power = (0.55 + 0.45 * (this.health / 100)) * (onRoad ? 1 : 0.62);

    if (c.throttle > 0) forward += s.accel * power * c.throttle * dt;
    if (c.brake > 0) {
      if (forward > 10) forward = Math.max(0, forward - s.brake * c.brake * dt);
      else forward -= s.accel * 0.5 * c.brake * dt;
    }
    if (!c.throttle && !c.brake) forward = approach(forward, 0, 85 * dt);

    const nitroActive = Boolean(c.nitro) && this.nitro > 0 && forward > -10;
    if (nitroActive) {
      forward += s.nitroPower * dt * (onRoad ? 1 : 0.75);
      if (!this.infiniteNitro) this.nitro = Math.max(0, this.nitro - 32 * dt);
    } else {
      this.nitro = Math.min(s.nitroCapacity, this.nitro + s.nitroRegen * dt);
    }

    // Drag tuned so full throttle settles at the car's top speed.
    const drag = (s.accel / s.topSpeed) * (onRoad ? 1 : 2.4);
    forward *= Math.exp(-drag * dt);
    forward = clamp(forward, -s.topSpeed * 0.32, s.topSpeed * (nitroActive ? 1.8 : 1.05));

    const steer = clamp(c.steer, -1, 1);
    this.steerVisual = damp(this.steerVisual, steer, 14, dt);
    const speedFactor = clamp(Math.abs(forward) / 105, 0, 1);
    const steerPower = s.handling * (0.3 + 0.7 * speedFactor) * (c.handbrake ? 1.3 : 1);
    this.angle += steer * steerPower * Math.sign(forward || 1) * dt;

    // Self-aligning torque keeps handling stable without killing long drifts.
    if (this.speed > 30) {
      const slip = wrapAngle(Math.atan2(this.vy, this.vx) - this.angle);
      const align = c.handbrake ? 0.45 : 1.35;
      this.angle += slip * align * dt * clamp(this.speed / 180, 0, 1);
    }

    let grip = s.grip * (onRoad ? 1 : 0.55) * (c.handbrake ? 0.16 : 1);
    grip *= 1 - s.driftiness * Math.abs(steer) * 0.42;
    lateral *= Math.exp(-Math.max(0.5, grip) * dt);

    this.vx = fx * forward + rx * lateral;
    this.vy = fy * forward + ry * lateral;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const slipAngle = Math.abs(wrapAngle(Math.atan2(this.vy, this.vx) - this.angle));
    this.drift = clamp((slipAngle - 0.12) / 0.6, 0, 1) * clamp(this.speed / 110, 0, 1);
    if (this.drift > 0.25 && this.speed > 90) {
      this.driftTimer += dt;
      this.driftCombo = 1 + Math.min(3, Math.floor(this.driftTimer / 2) * 0.5);
      this.driftScore += this.drift * this.speed * dt * this.driftCombo;
    } else {
      this.driftTimer = Math.max(0, this.driftTimer - dt * 2);
      this.driftCombo = 1 + Math.min(3, Math.floor(this.driftTimer / 2) * 0.5);
    }

    this.impactFlash = Math.max(0, this.impactFlash - dt * 3);
  }
}
