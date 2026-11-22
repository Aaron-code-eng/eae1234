/** Persistent player progression (credits, cars, upgrades, settings). */

import { CAR_TYPES } from '../entities/CarTypes.js';
import { PARTS } from '../systems/UpgradeSystem.js';

export const STORAGE_KEY = 'apex-drift.profile.v1';

export const DEFAULT_SETTINGS = {
  trackId: 'neon',
  laps: 3,
  aiCount: 3,
  difficulty: 0.92,
  minimap: true,
  showFps: false,
};

export function createDefaultProfile() {
  return {
    credits: 2500,
    ownedCars: ['starter'],
    selectedCar: 'starter',
    upgrades: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

function cleanUpgrades(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [carId, parts] of Object.entries(raw)) {
    if (!CAR_TYPES[carId] || !parts || typeof parts !== 'object') continue;
    result[carId] = {};
    for (const part of PARTS) {
      const level = Number(parts[part.id]);
      if (Number.isFinite(level)) result[carId][part.id] = Math.max(0, Math.min(part.max, Math.floor(level)));
    }
  }
  return result;
}

/** Normalise untrusted saved data into a valid profile. */
export function sanitizeProfile(raw) {
  const fallback = createDefaultProfile();
  if (!raw || typeof raw !== 'object') return fallback;

  const owned = Array.isArray(raw.ownedCars)
    ? [...new Set(raw.ownedCars.filter((id) => CAR_TYPES[id]))]
    : [];
  if (!owned.includes('starter')) owned.unshift('starter');

  const selectedCar = owned.includes(raw.selectedCar) ? raw.selectedCar : 'starter';
  const settings = { ...DEFAULT_SETTINGS };
  if (raw.settings && typeof raw.settings === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (raw.settings[key] !== undefined) settings[key] = raw.settings[key];
    }
  }
  settings.laps = [1, 3, 5].includes(Number(settings.laps)) ? Number(settings.laps) : 3;
  settings.aiCount = Math.max(0, Math.min(7, Math.floor(Number(settings.aiCount) || 0)));
  settings.difficulty = Math.max(0.6, Math.min(1.3, Number(settings.difficulty) || 0.92));
  settings.minimap = Boolean(settings.minimap);
  settings.showFps = Boolean(settings.showFps);

  const credits = Number(raw.credits);
  return {
    credits: Number.isFinite(credits) ? Math.max(0, Math.floor(credits)) : fallback.credits,
    ownedCars: owned,
    selectedCar,
    upgrades: cleanUpgrades(raw.upgrades),
    settings,
  };
}

export class ProfileStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  load() {
    try {
      const text = this.storage?.getItem(STORAGE_KEY);
      return sanitizeProfile(text ? JSON.parse(text) : null);
    } catch {
      return createDefaultProfile();
    }
  }

  save(profile) {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(sanitizeProfile(profile)));
      return true;
    } catch {
      return false;
    }
  }

  clear() {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      /* storage may be disabled; progress is simply session-only */
    }
  }
}
