/** Composition root: owns world state, fixed-step loop and all subsystems. */

import { clamp, rand } from './MathUtils.js';
import { Input } from './Input.js';
import { ProfileStore, createDefaultProfile } from './Profile.js';
import { Car } from '../entities/Car.js';
import { CAR_TYPES, getCarType } from '../entities/CarTypes.js';
import { Track } from '../world/Track.js';
import { getTrackDef } from '../world/Tracks.js';
import { PhysicsSystem } from '../systems/PhysicsSystem.js';
import { AIDriver } from '../systems/AIDriver.js';
import { RaceSystem } from '../systems/RaceSystem.js';
import { ParticleSystem, SkidMarks } from '../systems/ParticleSystem.js';
import { AdminSystem } from '../systems/AdminSystem.js';
import { buyUpgrade, computeStats } from '../systems/UpgradeSystem.js';
import { Camera } from '../render/Camera.js';
import { Renderer3D } from '../render/Renderer3D.js';
import { HUD } from '../render/HUD.js';
import { UI } from '../ui/UI.js';

const STEP = 1 / 120;
const AI_TYPES = ['racecar', 'drift', 'rally', 'starter', 'hyper'];

export class Game {
  constructor({ canvas, storage } = {}) {
    this.renderer = new Renderer3D(canvas);
    this.hud = new HUD();
    this.input = new Input();
    this.profileStore = new ProfileStore(storage);
    this.profile = this.profileStore.load();
    this.settings = this.profile.settings;
    this.admin = new AdminSystem();
    this.adminState = { god: false, noclip: false, showFps: false, boostUntil: 0 };

    this.camera = new Camera();
    this.particles = new ParticleSystem();
    this.skids = new SkidMarks();

    this.state = 'menu';
    this.fps = 60;
    this.frames = 0;
    this.fpsTime = 0;
    this.lastTime = 0;
    this.accumulator = 0;
    this.nextCarId = 0;
    this.lastDamageToast = 0;

    this.buildWorld();
    this.ui = new UI(this);
    requestAnimationFrame(this.loop);
  }

  /* --------------------------------------------------------- world */
  buildWorld(overrides = {}) {
    const settings = { ...this.settings, ...overrides };
    this.track = new Track(getTrackDef(settings.trackId));
    this.cars = [];
    this.player = this.createCar({ typeId: this.profile.selectedCar, isPlayer: true, slot: 0 });
    this.cars.push(this.player);

    const opponents = clamp(Math.floor(settings.aiCount), 0, 7);
    for (let index = 0; index < opponents; index++) {
      const car = this.createCar({ typeId: AI_TYPES[index % AI_TYPES.length], slot: index + 1 });
      car.ai = new AIDriver(car, this.track, this.settings.difficulty);
      this.cars.push(car);
    }

    this.physics = new PhysicsSystem(this.track, (impact) => this.handleImpact(impact));
    this.race = new RaceSystem(this.track, this.cars);
    this.particles.clear();
    this.skids.clear();
    this.bindRaceEvents();

    const grid = this.track.gridPosition(0);
    this.camera.snapTo(grid.x, grid.y);
    this.renderer.snapCamera();
  }

  createCar({ typeId, isPlayer = false, slot = 0, x, y, angle }) {
    const type = getCarType(typeId);
    const levels = isPlayer ? this.profile.upgrades[type.id] ?? {} : {};
    const position = x === undefined || y === undefined ? this.track.gridPosition(slot) : { x, y, angle: angle ?? 0 };
    return new Car({
      id: isPlayer ? 'player' : `ai-${++this.nextCarId}`,
      typeId: type.id,
      name: type.name,
      stats: computeStats(type.id, levels),
      isPlayer,
      ...position,
    });
  }

  bindRaceEvents() {
    this.race.on('countdown', (count) => this.hud.setCenter(count > 0 ? String(count) : 'GO!'));
    this.race.on('go', () => this.hud.setCenter('GO!'));
    this.race.on('lap', ({ car, lap }) => {
      if (car.isPlayer && this.race.state !== 'finished') this.toast(`Lap ${lap + 1}`);
    });
    this.race.on('finish', (results) => {
      this.profile.credits += results.credits;
      this.saveProfile();
      this.state = 'results';
      this.hud.setCenter('');
      this.ui.showResults(results);
    });
  }

  /* --------------------------------------------------------- modes */
  startRace(overrides = {}) {
    if (overrides.trackId !== undefined) this.settings.trackId = overrides.trackId;
    if (overrides.laps !== undefined) this.settings.laps = overrides.laps;
    if (overrides.aiCount !== undefined) this.settings.aiCount = overrides.aiCount;
    this.buildWorld();
    this.race.start({ laps: this.settings.laps, mode: 'race' });
    this.state = 'race';
    this.accumulator = 0;
    this.hud.setCenter('');
    this.ui.showScreen(null);
    this.saveProfile();
  }

  startFreeRoam() {
    this.buildWorld({ aiCount: Math.min(2, this.settings.aiCount) });
    this.race.start({ mode: 'freeroam' });
    this.state = 'freeroam';
    this.accumulator = 0;
    this.hud.setCenter('');
    this.ui.showScreen(null);
  }

  previewTrack(id) {
    this.settings.trackId = id;
    this.buildWorld();
  }

  goToMenu() {
    this.state = 'menu';
    this.hud.setCenter('');
    this.buildWorld();
    this.ui.refreshAll();
    this.ui.showScreen('menu');
  }

  setPaused(paused) {
    if (!['race', 'freeroam', 'paused'].includes(this.state)) return;
    this.state = paused ? 'paused' : (this.race.mode === 'race' ? 'race' : 'freeroam');
    this.ui.showScreen(paused ? 'pause' : null);
  }

  handleEscape() {
    if (this.state === 'race' || this.state === 'freeroam') this.setPaused(true);
    else if (this.state === 'paused') this.setPaused(false);
  }

  /* --------------------------------------------------------- loop */
  loop = (timestamp) => {
    const elapsed = this.lastTime ? Math.min((timestamp - this.lastTime) / 1000, 0.05) : 0;
    this.lastTime = timestamp;
    this.frameDt = elapsed;
    this.frames++;
    this.fpsTime += elapsed;
    if (this.fpsTime >= 0.5) {
      this.fps = this.frames / this.fpsTime;
      this.frames = 0;
      this.fpsTime = 0;
    }

    this.ui.update();

    if (this.state === 'race' || this.state === 'freeroam') {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 8) {
        this.update(STEP);
        this.accumulator -= STEP;
        steps++;
      }
    }

    this.hud.update(this);
    this.renderer.render(this);
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  };

  update(dt) {
    this.player.god = this.adminState.god;
    this.player.infiniteNitro = this.adminState.boostUntil > Date.now();

    if (this.input.consumePress('KeyR')) {
      this.player.respawn(this.track);
      this.toast('Car reset');
    }

    if (this.input.consumePress('KeyC')) {
      this.renderer.cycleCamera();
      this.toast(`Camera: ${this.renderer.cameraMode}`);
    }

    if (this.race.state !== 'countdown' && this.race.state !== 'finished') {
      Object.assign(this.player.controls, this.input.driveControls());
      for (const car of this.cars) if (car.ai) car.ai.update(dt);
      this.physics.update(dt, this.cars);
      this.updateEffects(dt);
    }
    this.race.update(dt);
    this.camera.follow(this.player, dt);
  }

  updateEffects(dt) {
    this.particles.update(dt);
    this.skids.update(dt);

    for (const car of this.cars) {
      const cos = Math.cos(car.angle);
      const sin = Math.sin(car.angle);
      const rx = -sin;
      const ry = cos;
      const rearX = car.x - cos * 12;
      const rearY = car.y - sin * 12;
      const sliding = (car.drift > 0.3 && car.speed > 80) || (car.controls.handbrake && car.speed > 60);

      if (sliding) {
        const left = { x: rearX + rx * 9, y: rearY + ry * 9 };
        const right = { x: rearX - rx * 9, y: rearY - ry * 9 };
        if (car.lastSkid) {
          this.skids.add(car.lastSkid.left.x, car.lastSkid.left.y, left.x, left.y, 5);
          this.skids.add(car.lastSkid.right.x, car.lastSkid.right.y, right.x, right.y, 5);
        }
        car.lastSkid = { left, right };

        if (Math.random() < 0.4) {
          this.particles.spawn('smoke', rearX, rearY, {
            vx: -car.vx * 0.08 + rand(-18, 18),
            vy: -car.vy * 0.08 + rand(-18, 18),
            life: rand(0.6, 1.1), size: rand(5, 9), grow: 12,
            color: '#9aa8bd', drag: 1.2,
          });
        }
      } else {
        car.lastSkid = null;
      }

      if (car.controls.nitro && car.speed > 60) {
        this.particles.spawn('flame', rearX, rearY, {
          vx: -cos * rand(60, 160) + rand(-25, 25),
          vy: -sin * rand(60, 160) + rand(-25, 25),
          life: rand(0.12, 0.25), size: rand(3, 6), color: '#66ddff', drag: 3,
        });
      }

      if (car.damaged && Math.random() < 0.06) {
        this.particles.spawn('smoke', car.x - cos * 15, car.y - sin * 15, {
          vx: rand(-8, 8), vy: -rand(10, 35), life: rand(0.8, 1.5),
          size: rand(4, 7), grow: 8, color: '#303844', drag: 0.8,
        });
      }

      if (!this.track.isOnRoad(car.x, car.y) && car.speed > 80 && Math.random() < 0.2) {
        this.particles.spawn('dust', car.x, car.y, {
          vx: rand(-40, 40), vy: rand(-40, 40), life: rand(0.4, 0.8),
          size: rand(4, 8), grow: 6, color: '#7b6c58', drag: 2,
        });
      }
    }
  }

  handleImpact({ car, strength, x, y, damage }) {
    if (strength < 40) return;
    this.particles.burst('spark', x, y, Math.min(14, Math.round(strength / 18)), {
      minSpeed: 60, maxSpeed: Math.max(90, strength * 1.3),
      life: 0.45, size: 2.4, color: '#ffd98a', drag: 2.4,
    });
    if (car.isPlayer) this.camera.addShake(Math.min(14, strength / 28));
    if (car.isPlayer && damage > 5 && Date.now() - this.lastDamageToast > 900) {
      this.lastDamageToast = Date.now();
      this.toast(`-${Math.round(damage)} damage`, 'error');
    }
  }

  /* --------------------------------------------------------- profile */
  saveProfile() {
    return this.profileStore.save(this.profile);
  }

  resetProfile() {
    this.profileStore.clear();
    this.profile = createDefaultProfile();
    this.settings = this.profile.settings;
    this.adminState.showFps = false;
    this.buildWorld();
    this.ui.refreshAll();
    this.saveProfile();
  }

  rebuildPlayerCar() {
    const previous = this.player;
    const type = getCarType(this.profile.selectedCar);
    const stats = computeStats(type.id, this.profile.upgrades[type.id] ?? {});
    const replacement = new Car({
      id: 'player',
      typeId: type.id,
      name: type.name,
      stats,
      x: previous?.x ?? 0,
      y: previous?.y ?? 0,
      angle: previous?.angle ?? 0,
      isPlayer: true,
    });
    if (previous) {
      replacement.lap = previous.lap;
      replacement.nextCheckpoint = previous.nextCheckpoint;
      replacement.driftScore = previous.driftScore;
      replacement.health = previous.health;
      replacement.god = previous.god;
      replacement.noclip = previous.noclip;
      replacement.infiniteNitro = previous.infiniteNitro;
    }
    const index = this.cars.indexOf(previous);
    if (index >= 0) this.cars[index] = replacement;
    else this.cars.unshift(replacement);
    this.player = replacement;
    this.race.updateStandings();
  }

  buyCar(id) {
    const type = CAR_TYPES[id];
    if (!type) return { ok: false, message: 'Unknown car.' };
    if (this.profile.ownedCars.includes(id)) return this.selectCar(id);
    if (this.profile.credits < type.price) return { ok: false, message: `Need ${type.price} credits.` };
    this.profile.credits -= type.price;
    this.profile.ownedCars.push(id);
    this.profile.selectedCar = id;
    this.rebuildPlayerCar();
    this.saveProfile();
    return { ok: true, message: `${type.name} purchased.` };
  }

  selectCar(id) {
    if (!this.profile.ownedCars.includes(id)) return { ok: false, message: 'Car not owned.' };
    this.profile.selectedCar = id;
    this.rebuildPlayerCar();
    this.saveProfile();
    return { ok: true, message: `${CAR_TYPES[id].name} selected.` };
  }

  setPlayerCar(id) {
    if (!CAR_TYPES[id]) return { ok: false, message: 'Unknown car.' };
    if (!this.profile.ownedCars.includes(id)) this.profile.ownedCars.push(id);
    this.profile.selectedCar = id;
    this.rebuildPlayerCar();
    this.saveProfile();
    return { ok: true, message: `Player car set to ${CAR_TYPES[id].name}.` };
  }

  buyUpgrade(partId) {
    const result = buyUpgrade(this.profile, this.profile.selectedCar, partId);
    if (result.ok) {
      this.rebuildPlayerCar();
      this.saveProfile();
    }
    return result;
  }

  /* --------------------------------------------------------- cars */
  spawnAI(typeId, x, y) {
    const type = getCarType(typeId);
    const car = this.createCar({
      typeId: type.id, x, y, angle: this.player.angle,
    });
    car.ai = new AIDriver(car, this.track, this.settings.difficulty);
    this.cars.push(car);
    this.race.updateStandings();
    return car;
  }

  removeCar(id) {
    if (id === 'player') return false;
    const index = this.cars.findIndex((car) => car.id === id);
    if (index < 0) return false;
    this.cars.splice(index, 1);
    this.race.updateStandings();
    return true;
  }

  setAiCount(count) {
    const target = clamp(Math.floor(count), 0, 7);
    const opponents = this.cars.filter((car) => !car.isPlayer);
    while (opponents.length > target) {
      const car = opponents.pop();
      const index = this.cars.indexOf(car);
      if (index >= 0) this.cars.splice(index, 1);
    }
    while (opponents.length < target) {
      const typeId = AI_TYPES[opponents.length % AI_TYPES.length];
      const car = this.createCar({ typeId, slot: opponents.length + 1 });
      car.ai = new AIDriver(car, this.track, this.settings.difficulty);
      this.cars.push(car);
      opponents.push(car);
    }
    this.settings.aiCount = target;
    this.race.updateStandings();
    this.saveProfile();
  }

  /* --------------------------------------------------------- admin */
  adminContext() {
    return {
      game: this,
      player: this.player,
      race: this.race,
      track: this.track,
      profile: this.profile,
      ui: this.ui,
    };
  }

  toast(message, kind) {
    this.ui.toast(message, kind);
  }
}
