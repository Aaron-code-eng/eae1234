/** Screen routing, garage/settings menus, toast messages and admin console. */

import { clamp, formatCredits, formatTime } from '../core/MathUtils.js';
import { CAR_LIST, CAR_TYPES } from '../entities/CarTypes.js';
import { PARTS, computeStats, costFor, levelsFor } from '../systems/UpgradeSystem.js';
import { TRACKS } from '../world/Tracks.js';

const SCREEN_IDS = ['menu', 'garage', 'settings', 'pause', 'results'];
const byId = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.screens = Object.fromEntries(SCREEN_IDS.map((id) => [id, byId(`screen-${id}`)]));
    this.console = byId('console');
    this.output = byId('console-output');
    this.input = byId('console-input');
    this.toasts = byId('toasts');
    this.selectedGarageCar = game.profile.selectedCar;
    this.bind();
    this.refreshAll();
    this.showScreen('menu');
  }

  /* --------------------------------------------------------- screens */
  showScreen(name) {
    for (const [id, element] of Object.entries(this.screens)) {
      element.classList.toggle('hidden', id !== name);
    }
    const inGame = name === null || name === 'pause' || name === 'results';
    this.game.hud.setVisible(inGame);
  }

  bind() {
    const game = this.game;

    byId('btn-race').addEventListener('click', () => game.startRace());
    byId('btn-free').addEventListener('click', () => game.startFreeRoam());
    byId('btn-garage').addEventListener('click', () => {
      this.selectedGarageCar = game.profile.selectedCar;
      this.refreshGarage();
      this.showScreen('garage');
    });
    byId('btn-settings').addEventListener('click', () => {
      this.refreshSettings();
      this.showScreen('settings');
    });
    byId('garage-back').addEventListener('click', () => {
      this.refreshMenu();
      this.showScreen('menu');
    });
    byId('settings-back').addEventListener('click', () => {
      this.refreshMenu();
      this.showScreen('menu');
    });

    byId('pause-resume').addEventListener('click', () => game.setPaused(false));
    byId('pause-restart').addEventListener('click', () => game.startRace());
    byId('pause-menu').addEventListener('click', () => game.goToMenu());
    byId('results-retry').addEventListener('click', () => game.startRace());
    byId('results-continue').addEventListener('click', () => game.goToMenu());

    const menuTrack = byId('menu-track');
    menuTrack.innerHTML = TRACKS.map((track) => `<option value="${track.id}">${track.name}</option>`).join('');
    menuTrack.addEventListener('change', (event) => {
      game.settings.trackId = event.target.value;
      game.previewTrack(event.target.value);
      game.saveProfile();
    });
    byId('menu-laps').addEventListener('change', (event) => {
      game.settings.laps = Number(event.target.value);
      game.saveProfile();
    });
    byId('menu-ai').addEventListener('change', (event) => {
      game.settings.aiCount = Number(event.target.value);
      game.saveProfile();
    });

    byId('set-laps').addEventListener('change', (event) => {
      game.settings.laps = Number(event.target.value);
      byId('menu-laps').value = String(game.settings.laps);
      game.saveProfile();
    });
    byId('set-ai').addEventListener('change', (event) => {
      game.settings.aiCount = Number(event.target.value);
      byId('menu-ai').value = String(game.settings.aiCount);
      game.saveProfile();
    });
    byId('set-difficulty').addEventListener('change', (event) => {
      game.settings.difficulty = Number(event.target.value);
      game.saveProfile();
    });
    byId('set-minimap').addEventListener('change', (event) => {
      game.settings.minimap = event.target.checked;
      game.saveProfile();
    });
    byId('set-fps').addEventListener('change', (event) => {
      game.settings.showFps = event.target.checked;
      game.adminState.showFps = event.target.checked;
      game.saveProfile();
    });

    byId('garage-list').addEventListener('click', (event) => this.onGarageClick(event));
    byId('garage-upgrades').addEventListener('click', (event) => this.onUpgradeClick(event));

    byId('console-close').addEventListener('click', () => this.closeConsole());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.executeConsole();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.closeConsole();
      }
    });
  }

  update() {
    const input = this.game.input;
    if (input.consumePress('Backquote') || input.consumePress('F1')) this.toggleConsole();
    if (input.consumePress('Escape')) {
      if (this.isConsoleOpen()) this.closeConsole();
      else this.game.handleEscape();
    }
  }

  /* --------------------------------------------------------- refresh */
  refreshAll() {
    this.refreshMenu();
    this.refreshGarage();
    this.refreshSettings();
  }

  refreshMenu() {
    byId('menu-credits').textContent = formatCredits(this.game.profile.credits);
    byId('menu-track').value = this.game.settings.trackId;
    byId('menu-laps').value = String(this.game.settings.laps);
    byId('menu-ai').value = String(this.game.settings.aiCount);
  }

  refreshSettings() {
    const settings = this.game.settings;
    byId('set-laps').value = String(settings.laps);
    byId('set-ai').value = String(settings.aiCount);
    byId('set-difficulty').value = String(settings.difficulty);
    byId('set-minimap').checked = settings.minimap;
    byId('set-fps').checked = settings.showFps;
  }

  refreshGarage() {
    const { profile } = this.game;
    const selected = profile.ownedCars.includes(this.selectedGarageCar)
      ? this.selectedGarageCar : profile.selectedCar;
    this.selectedGarageCar = selected;

    byId('garage-credits').textContent = formatCredits(profile.credits);
    byId('garage-list').innerHTML = CAR_LIST.map((type) => {
      const owned = profile.ownedCars.includes(type.id);
      const active = profile.selectedCar === type.id;
      const action = active
        ? '<span class="label">ACTIVE</span>'
        : owned
          ? `<button class="btn" data-action="select" data-id="${type.id}">SELECT</button>`
          : `<button class="btn" data-action="buy" data-id="${type.id}">${formatCredits(type.price)}</button>`;
      return `
        <div class="car-card ${selected === type.id ? 'selected' : ''}" data-detail="${type.id}">
          <span class="swatch" style="background:${type.color}"></span>
          <span class="info"><b>${type.name}</b><small>${type.category} · ${owned ? 'Owned' : formatCredits(type.price) + ' credits'}</small></span>
          ${action}
        </div>`;
    }).join('');

    const stats = computeStats(selected, levelsFor(profile, selected));
    const rows = [
      ['Top speed', stats.topSpeed, 900],
      ['Accel', stats.accel, 750],
      ['Grip', stats.grip, 17],
      ['Handling', stats.handling, 3.8],
      ['Brakes', stats.brake, 800],
      ['Nitro', stats.nitroCapacity, 200],
    ];
    byId('garage-stats').innerHTML = `
      <div class="car-name">${CAR_TYPES[selected].name}</div>
      <div class="label subtle">${CAR_TYPES[selected].description}</div>
      ${rows.map(([label, value, max]) => `
        <div class="stat"><span>${label}</span><span class="track"><span class="fill" style="width:${clamp((value / max) * 100, 0, 100)}%"></span></span><em>${Math.round(value)}</em></div>
      `).join('')}`;

    const levels = levelsFor(profile, selected);
    byId('garage-upgrades').innerHTML = PARTS.map((part) => {
      const level = levels[part.id] ?? 0;
      const cost = costFor(part.id, level);
      const pips = Array.from({ length: part.max }, (_, i) => `<span class="pip ${i < level ? 'on' : ''}"></span>`).join('');
      const button = cost === null
        ? '<span class="label">MAX</span>'
        : `<button class="btn" data-upgrade="${part.id}" ${profile.credits < cost ? 'disabled' : ''}>${formatCredits(cost)}</button>`;
      return `
        <div class="upgrade-row">
          <span class="u-info"><b>${part.name}</b> <small>${part.description}</small><span class="pips">${pips}</span></span>
          ${button}
        </div>`;
    }).join('');
  }

  onGarageClick(event) {
    const action = event.target.closest('[data-action]');
    const detail = event.target.closest('[data-detail]');
    if (action) {
      const id = action.dataset.id;
      if (action.dataset.action === 'buy') this.game.buyCar(id);
      else this.game.selectCar(id);
      this.selectedGarageCar = id;
      this.refreshAll();
    } else if (detail) {
      this.selectedGarageCar = detail.dataset.detail;
      this.refreshGarage();
    }
  }

  onUpgradeClick(event) {
    const button = event.target.closest('[data-upgrade]');
    if (!button) return;
    const result = this.game.buyUpgrade(button.dataset.upgrade);
    this.toast(result.message, result.ok ? 'good' : 'error');
    this.refreshAll();
  }

  showResults(data) {
    byId('results-title').textContent = data.rank === 1 ? 'WINNER' : `FINISHED  #${data.rank}`;
    byId('results-rows').innerHTML = `
      ${data.standings.map((row) => `
        <div class="result-row ${row.isPlayer ? 'you' : ''}">
          <span class="rp">${row.rank}</span>
          <span>${row.name}</span>
          <span class="rt">${row.time === null ? 'DNF' : formatTime(row.time)}</span>
          <span class="rc">${row.isPlayer ? `+${formatCredits(row.credits)}` : ''}</span>
        </div>`).join('')}
      <div class="reward-line">
        +${formatCredits(data.credits)} credits · best lap ${formatTime(data.bestLap)} ·
        drift ${formatCredits(data.driftScore)}
      </div>`;
    this.showScreen('results');
  }

  /* --------------------------------------------------------- console */
  isConsoleOpen() {
    return !this.console.classList.contains('hidden');
  }

  toggleConsole() {
    if (this.isConsoleOpen()) this.closeConsole();
    else this.openConsole();
  }

  openConsole() {
    this.console.classList.remove('hidden');
    this.printConsole('Type /help for commands. Backquote or ESC closes.', 'muted');
    this.input.focus();
  }

  closeConsole() {
    this.console.classList.add('hidden');
    this.input.blur();
    this.game.input.pressed.clear();
  }

  printConsole(message, kind = 'ok') {
    const prefix = kind === 'error' ? '! ' : kind === 'input' ? '> ' : kind === 'muted' ? '' : '';
    this.output.textContent += `${prefix}${message}\n`;
    this.output.scrollTop = this.output.scrollHeight;
  }

  executeConsole() {
    const line = this.input.value.trim();
    if (!line) return;
    this.input.value = '';
    this.printConsole(line, 'input');
    const result = this.game.admin.execute(line, this.game.adminContext());
    if (result.clear) this.output.textContent = '';
    if (result.message) this.printConsole(result.message, result.ok ? 'ok' : 'error');
  }

  /* --------------------------------------------------------- toasts */
  toast(message, kind = '') {
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = message;
    this.toasts.appendChild(node);
    setTimeout(() => node.remove(), 2800);
  }
}
