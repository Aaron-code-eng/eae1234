/** Race state machine: countdown, ordered checkpoints, laps and standings. */

import { Emitter } from '../core/Events.js';
import { clamp } from '../core/MathUtils.js';

const POSITION_BONUS = [3000, 1900, 1200, 800, 550, 400, 300, 200];

/** Did the car cross a checkpoint gate in the forward direction this step? */
export function crossedGate(car, gate, maxDistance) {
  // Longitudinal position: negative before the gate, positive after it.
  const before = (car.prevX - gate.x) * gate.tx + (car.prevY - gate.y) * gate.ty;
  const after = (car.x - gate.x) * gate.tx + (car.y - gate.y) * gate.ty;
  if (before >= 0 || after < 0) return false;

  // The crossing point must lie inside the road, not miles off to the side.
  const t = before / (before - after);
  const ix = car.prevX + (car.x - car.prevX) * t;
  const iy = car.prevY + (car.y - car.prevY) * t;
  const lateral = (ix - gate.x) * -gate.ty + (iy - gate.y) * gate.tx;
  return Math.abs(lateral) <= maxDistance;
}

export class RaceSystem extends Emitter {
  constructor(track, cars) {
    super();
    this.track = track;
    this.cars = cars;
    this.state = 'idle';
    this.mode = 'race';
    this.laps = 3;
    this.time = 0;
    this.countdown = 0;
    this.lastBeep = -1;
    this.standings = [];
    this.finishOrder = [];
  }

  start({ laps = 3, mode = 'race' } = {}) {
    this.mode = mode;
    this.laps = Math.max(1, Math.floor(laps));
    this.time = 0;
    this.countdown = mode === 'race' ? 3.2 : 0;
    this.lastBeep = -1;
    this.finishOrder = [];
    this.state = mode === 'race' ? 'countdown' : 'freeroam';

    this.cars.forEach((car, index) => {
      const slot = this.track.gridPosition(index);
      car.prepareForRace(slot.x, slot.y, slot.angle);
    });
    this.updateStandings();
  }

  addCar(car) {
    this.cars.push(car);
    this.updateStandings();
  }

  removeCar(id) {
    const index = this.cars.findIndex((car) => car.id === id);
    if (index >= 0) this.cars.splice(index, 1);
    this.updateStandings();
  }

  distanceToGate(car) {
    const gate = this.track.checkpoints[car.nextCheckpoint % this.track.checkpoints.length];
    return Math.hypot(gate.x - car.x, gate.y - car.y);
  }

  checkGates(car) {
    const gates = this.track.checkpoints;
    const gate = gates[car.nextCheckpoint % gates.length];
    if (!crossedGate(car, gate, this.track.halfWidth + 24)) return;

    if (car.nextCheckpoint !== 0) {
      car.nextCheckpoint = (car.nextCheckpoint + 1) % gates.length;
      return;
    }

    const lapTime = this.time - car.lapStartTime;
    car.bestLap = car.bestLap === null ? lapTime : Math.min(car.bestLap, lapTime);
    car.lapStartTime = this.time;
    car.lap += 1;
    car.nextCheckpoint = 1;

    this.emit('lap', { car, lap: car.lap, lapTime });
    if (car.lap >= this.laps) {
      car.finished = true;
      car.finishTime = this.time;
      this.finishOrder.push(car);
      this.emit('carFinished', car);
      if (car.isPlayer) this.finishPlayer();
    }
  }

  finishPlayer() {
    const player = this.cars.find((car) => car.isPlayer);
    if (!player) return;
    this.updateStandings();

    const rank = clamp(player.rank, 1, POSITION_BONUS.length);
    const positionBonus = POSITION_BONUS[rank - 1] ?? 150;
    const timeBonus = Math.max(0, Math.round(2200 - this.time * 10));
    const driftBonus = Math.round(player.driftScore * 0.12);
    const credits = positionBonus + timeBonus + driftBonus;

    this.state = 'finished';
    this.emit('finish', {
      rank,
      time: player.finishTime,
      bestLap: player.bestLap,
      driftScore: Math.floor(player.driftScore),
      positionBonus,
      timeBonus,
      driftBonus,
      credits,
      standings: this.standings.map((car) => ({
        rank: car.rank,
        name: car.name,
        color: car.typeId,
        time: car.finishTime,
        isPlayer: car.isPlayer,
        credits: car.isPlayer ? credits : 0,
      })),
    });
  }

  updateStandings() {
    const ranked = [...this.cars].sort((a, b) => {
      if (this.mode === 'freeroam') return b.speed - a.speed;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      const gateCount = this.track.checkpoints.length;
      const scoreA = a.lap * gateCount + a.nextCheckpoint;
      const scoreB = b.lap * gateCount + b.nextCheckpoint;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return this.distanceToGate(a) - this.distanceToGate(b);
    });
    ranked.forEach((car, index) => { car.rank = index + 1; });
    this.standings = ranked;
  }

  update(dt) {
    if (this.state === 'countdown') {
      const previous = Math.ceil(this.countdown);
      this.countdown -= dt;
      const current = Math.ceil(this.countdown);
      if (current !== previous && current >= 0 && current !== this.lastBeep) {
        this.lastBeep = current;
        this.emit('countdown', current);
      }
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.emit('go');
      }
      return;
    }

    if (this.state !== 'racing' && this.state !== 'freeroam') return;
    this.time += dt;
    if (this.mode === 'race') {
      for (const car of this.cars) {
        if (!car.finished) this.checkGates(car);
      }
    }
    this.updateStandings();
  }
}
