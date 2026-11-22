import test from 'node:test';
import assert from 'node:assert/strict';

import { formatTime, wrapAngle } from '../src/core/MathUtils.js';
import { ProfileStore, createDefaultProfile, sanitizeProfile } from '../src/core/Profile.js';
import { Car } from '../src/entities/Car.js';
import { CAR_TYPES } from '../src/entities/CarTypes.js';
import { Track } from '../src/world/Track.js';
import { TRACKS } from '../src/world/Tracks.js';
import { crossedGate } from '../src/systems/RaceSystem.js';
import { AdminSystem } from '../src/systems/AdminSystem.js';
import { buyUpgrade, computeStats, costFor } from '../src/systems/UpgradeSystem.js';

const makeCar = (overrides = {}) => new Car({
  id: 'player', typeId: 'starter', name: 'Street 240',
  stats: computeStats('starter'), isPlayer: true, ...overrides,
});

test('math helpers', () => {
  assert.ok(Math.abs(Math.abs(wrapAngle(Math.PI * 3)) - Math.PI) < 1e-9);
  assert.equal(formatTime(65.25), '01:05.25');
  assert.equal(formatTime(NaN), '--:--.--');
});

test('track geometry and grid slots', () => {
  const track = new Track(TRACKS[0]);
  assert.ok(track.points.length > 50);
  assert.equal(track.checkpoints[0].index, 0);

  const near = track.nearest(track.points[10].x, track.points[10].y);
  assert.ok(near.dist < 2);
  assert.ok(track.isOnRoad(track.points[10].x, track.points[10].y));
  assert.equal(track.isOnRoad(5000, 5000), false);

  const slot = track.gridPosition(3);
  assert.ok(Number.isFinite(slot.x) && Number.isFinite(slot.angle));
});

test('checkpoint gates only count in the forward direction', () => {
  const gate = { x: 0, y: 0, tx: 1, ty: 0 }; // faces +x, road runs across y
  assert.equal(crossedGate({ prevX: -10, prevY: 5, x: 10, y: 5 }, gate, 100), true);
  assert.equal(crossedGate({ prevX: 10, prevY: 5, x: -10, y: 5 }, gate, 100), false);
  assert.equal(crossedGate({ prevX: -10, prevY: 600, x: 10, y: 600 }, gate, 100), false);
});

test('car accelerates, brakes and takes damage', () => {
  const car = makeCar();
  for (let i = 0; i < 120; i++) car.integrate(1 / 120, { throttle: 1, brake: 0, steer: 0 }, { onRoad: true });
  assert.ok(car.speed > 200);
  assert.ok(car.x > 0);

  const before = car.speed;
  for (let i = 0; i < 60; i++) car.integrate(1 / 120, { throttle: 0, brake: 1, steer: 0 }, { onRoad: true });
  assert.ok(car.speed < before);

  const dealt = car.applyDamage(20);
  assert.ok(Math.abs(dealt - 20 * (1 - CAR_TYPES.starter.stats.armor)) < 1e-6);
  car.god = true;
  assert.equal(car.applyDamage(20), 0);
});

test('drift car slides more than a race car under handbrake', () => {
  const slide = (typeId) => {
    const car = new Car({
      id: 'x', typeId, name: typeId, stats: computeStats(typeId), vx: 320,
    });
    for (let i = 0; i < 40; i++) {
      car.integrate(1 / 120, { throttle: 0.4, brake: 0, steer: 1, handbrake: true, nitro: false }, { onRoad: true });
    }
    return car.drift;
  };
  assert.ok(slide('drift') > slide('racecar'));
});

test('upgrades cost credits and improve stats', () => {
  const base = computeStats('starter');
  const upgraded = computeStats('starter', { engine: 2, tires: 1 });
  assert.ok(upgraded.accel > base.accel);
  assert.ok(upgraded.grip > base.grip);
  assert.equal(costFor('engine', 5), null);

  const profile = createDefaultProfile();
  profile.credits = 5000;
  const result = buyUpgrade(profile, 'starter', 'engine');
  assert.equal(result.ok, true);
  assert.equal(profile.upgrades.starter.engine, 1);
  assert.equal(profile.credits, 4100);
});

test('profile storage round-trips and sanitises data', () => {
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
  const store = new ProfileStore(storage);
  const profile = createDefaultProfile();
  profile.credits = 1234;
  profile.upgrades.starter = { engine: 3, bogus: 9 };
  assert.equal(store.save(profile), true);
  const loaded = store.load();
  assert.equal(loaded.credits, 1234);
  assert.equal(loaded.upgrades.starter.engine, 3);
  assert.equal(loaded.upgrades.starter.bogus, undefined);

  const cleaned = sanitizeProfile({ credits: -5, ownedCars: ['nope'], selectedCar: 'nope' });
  assert.equal(cleaned.credits, 0);
  assert.deepEqual(cleaned.ownedCars, ['starter']);
  assert.equal(cleaned.selectedCar, 'starter');
});

test('admin commands parse and mutate context', () => {
  const events = [];
  const profile = createDefaultProfile();
  const player = makeCar();
  const ctx = {
    game: {
      player, cars: [player], adminState: {},
      saveProfile: () => events.push('save'),
      setPlayerCar: (id) => events.push(`car:${id}`),
    },
    player,
    profile,
    ui: { refreshAll: () => events.push('ui'), toast: () => {} },
    race: { time: 0, updateStandings: () => {} },
    track: new Track(TRACKS[0]),
  };
  const admin = new AdminSystem();

  assert.equal(admin.execute('/credits 500', ctx).ok, true);
  assert.equal(profile.credits, 3000);
  assert.equal(admin.execute('/god', ctx).ok, true);
  assert.equal(player.god, true);
  assert.match(admin.execute('/help', ctx).message, /\/credits/);
  assert.equal(admin.execute('/nope', ctx).ok, false);
  assert.equal(admin.execute('/credits banana', ctx).ok, false);
  assert.equal(admin.execute('/car racecar', ctx).ok, true);
  assert.ok(events.includes('car:racecar'));
});
