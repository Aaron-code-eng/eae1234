/** DOM HUD + 2D minimap. Reads game state; never mutates it. */

import { clamp, formatCredits, formatTime } from '../core/MathUtils.js';

const IDS = [
  'hud-lap', 'hud-pos', 'hud-time', 'hud-best', 'hud-standings',
  'hud-credits', 'hud-fps', 'hud-mode', 'hud-car-name', 'hud-speed',
  'hud-gear', 'hud-rpm-fill', 'hud-nitro-label', 'hud-nitro-fill',
  'hud-damage-label', 'hud-damage-fill', 'hud-drift', 'hud-drift-mult',
  'hud-center', 'minimap', 'hud',
];

export class HUD {
  constructor() {
    this.el = Object.fromEntries(IDS.map((id) => [id, document.getElementById(id)]));
    this.minimapCtx = this.el.minimap.getContext('2d');
  }

  setVisible(visible) {
    this.el.hud.classList.toggle('hidden', !visible);
  }

  setCenter(text) {
    this.el['hud-center'].textContent = text ?? '';
    this.el['hud-center'].classList.toggle('hidden', !text);
  }

  update(game) {
    const player = game.player;
    const race = game.race;
    if (!player || !race) return;
    const el = this.el;

    el['hud-lap'].textContent = race.mode === 'race'
      ? `${Math.min(player.lap + 1, race.laps)}/${race.laps}` : 'FREE';
    el['hud-pos'].textContent = race.mode === 'race' ? `${player.rank}/${game.cars.length}` : '--';
    el['hud-time'].textContent = formatTime(race.time);
    el['hud-best'].textContent = formatTime(player.bestLap);
    el['hud-credits'].textContent = formatCredits(game.profile.credits);
    el['hud-mode'].textContent = race.mode === 'race' ? 'RACE' : 'FREE ROAM';
    el['hud-car-name'].textContent = player.name;

    el['hud-speed'].textContent = player.kmh;
    const perGear = player.stats.topSpeed / 6;
    el['hud-gear'].textContent = player.speed < 8
      ? (player.controls.brake > 0 ? 'R' : 'N')
      : String(Math.min(6, Math.floor(player.speed / perGear) + 1));
    el['hud-rpm-fill'].style.width = `${clamp(((player.speed / perGear) % 1) * 100, 8, 100)}%`;

    const nitroPercent = clamp((player.nitro / player.stats.nitroCapacity) * 100, 0, 100);
    el['hud-nitro-fill'].style.width = `${nitroPercent}%`;
    el['hud-nitro-label'].textContent = `${Math.round(nitroPercent)}%`;

    const damage = clamp(100 - player.health, 0, 100);
    el['hud-damage-fill'].style.width = `${damage}%`;
    el['hud-damage-label'].textContent = `${Math.round(damage)}%`;

    el['hud-drift'].textContent = formatCredits(player.driftScore);
    el['hud-drift-mult'].textContent = `x${player.driftCombo.toFixed(1)}`;

    const showFps = game.settings.showFps || game.adminState.showFps;
    el['hud-fps'].classList.toggle('hidden', !showFps);
    if (showFps) el['hud-fps'].textContent = `${Math.round(game.fps)} FPS`;

    el['hud-standings'].innerHTML = race.standings.slice(0, 8).map((car) => `
      <div class="row ${car.isPlayer ? 'you' : ''}">
        <span><span class="pos">${car.rank}.</span> ${car.name}</span>
        <span>${car.finished ? formatTime(car.finishTime) : `${car.lap + 1}/${race.laps}`}</span>
      </div>`).join('');

    const showMap = game.settings.minimap;
    el.minimap.classList.toggle('hidden', !showMap);
    if (showMap) game.renderer.drawMinimap(this.minimapCtx, game.track, game.cars, el.minimap.width, el.minimap.height);
  }
}
