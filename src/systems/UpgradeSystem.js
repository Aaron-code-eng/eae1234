/** Upgrade catalogue, stat computation and purchasing. */

import { CAR_TYPES } from '../entities/CarTypes.js';

export const PARTS = [
  { id: 'engine', name: 'Engine', description: 'Acceleration +9%, top speed +5% per level.', max: 5, costs: [900, 1600, 2800, 4600, 7500] },
  { id: 'tires', name: 'Tires', description: 'Lateral grip +10% per level. Better cornering.', max: 5, costs: [700, 1300, 2200, 3600, 6000] },
  { id: 'brakes', name: 'Brakes', description: 'Braking power +12% per level.', max: 5, costs: [500, 1000, 1800, 3000, 5000] },
  { id: 'suspension', name: 'Suspension', description: 'Steering response +7%, grip +2% per level.', max: 5, costs: [650, 1200, 2100, 3400, 5600] },
  { id: 'nitro', name: 'Nitro', description: 'Boost power +13%, capacity +15% per level.', max: 5, costs: [800, 1500, 2600, 4300, 7000] },
  { id: 'armor', name: 'Armor', description: 'Impact damage reduction +9% per level.', max: 5, costs: [600, 1100, 1900, 3200, 5400] },
];

export const PART_IDS = PARTS.map((part) => part.id);

export function getPart(id) {
  return PARTS.find((part) => part.id === id);
}

export function costFor(partId, currentLevel) {
  const part = getPart(partId);
  if (!part || currentLevel < 0 || currentLevel >= part.max) return null;
  return part.costs[currentLevel];
}

/** Base car stats with all owned upgrade levels applied. */
export function computeStats(typeId, levels = {}) {
  const type = CAR_TYPES[typeId] ?? CAR_TYPES.starter;
  const stats = { ...type.stats };
  const level = (id) => {
    const part = getPart(id);
    const value = Number(levels?.[id]);
    return part && Number.isFinite(value) ? Math.max(0, Math.min(part.max, Math.floor(value))) : 0;
  };

  const engine = level('engine');
  stats.accel *= 1 + 0.09 * engine;
  stats.topSpeed *= 1 + 0.05 * engine;

  const tires = level('tires');
  stats.grip *= 1 + 0.1 * tires;

  const brakes = level('brakes');
  stats.brake *= 1 + 0.12 * brakes;

  const suspension = level('suspension');
  stats.handling *= 1 + 0.07 * suspension;
  stats.grip *= 1 + 0.02 * suspension;

  const nitro = level('nitro');
  stats.nitroPower *= 1 + 0.13 * nitro;
  stats.nitroCapacity *= 1 + 0.15 * nitro;
  stats.nitroRegen *= 1 + 0.08 * nitro;

  const armor = level('armor');
  stats.armor = Math.min(0.65, stats.armor + 0.09 * armor);

  return stats;
}

export function levelsFor(profile, carId) {
  return profile?.upgrades?.[carId] ?? {};
}

/** Mutates the profile only when the purchase is valid. */
export function buyUpgrade(profile, carId, partId) {
  const part = getPart(partId);
  if (!part) return { ok: false, message: `Unknown upgrade '${partId}'.` };

  const levels = profile.upgrades[carId] ?? (profile.upgrades[carId] = {});
  const current = levels[partId] ?? 0;
  const cost = costFor(partId, current);
  if (cost === null) return { ok: false, message: `${part.name} is already maxed.` };
  if (profile.credits < cost) return { ok: false, message: `Need ${cost} credits for ${part.name}.` };

  profile.credits -= cost;
  levels[partId] = current + 1;
  return { ok: true, message: `${part.name} upgraded to level ${current + 1}.`, cost, level: current + 1 };
}
