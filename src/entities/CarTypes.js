/**
 * Car catalogue. All values are in "world units" (roughly pixels) per second.
 * `driftiness` lowers lateral grip while steering; high values = drift cars.
 */
function car(id, config) {
  return { id, ...config };
}

export const CAR_TYPES = {
  starter: car('starter', {
    name: 'Street 240',
    category: 'Street',
    price: 0,
    color: '#4ea8ff',
    accent: '#e2f4ff',
    spoiler: false,
    description: 'A balanced daily driver. Forgiving, cheap to upgrade, and always ready for a slide.',
    stats: { accel: 360, topSpeed: 470, brake: 520, grip: 10.5, driftiness: 0.35, handling: 2.35, nitroPower: 280, nitroCapacity: 100, nitroRegen: 8, armor: 0.06, mass: 1.0 },
  }),
  drift: car('drift', {
    name: 'Kazama S15',
    category: 'Drift',
    price: 9000,
    color: '#ffb648',
    accent: '#fff0cf',
    spoiler: true,
    description: 'Rear-happy and eager to rotate. Hold space to lay down huge, controllable drifts.',
    stats: { accel: 430, topSpeed: 560, brake: 490, grip: 7.6, driftiness: 0.98, handling: 3.05, nitroPower: 310, nitroCapacity: 140, nitroRegen: 9, armor: 0.05, mass: 0.95 },
  }),
  racecar: car('racecar', {
    name: 'Veloce GT',
    category: 'Race',
    price: 12000,
    color: '#ff4d5e',
    accent: '#ffe3e6',
    spoiler: true,
    description: 'A purpose-built circuit weapon. Huge grip, fast acceleration, precise turn-in.',
    stats: { accel: 540, topSpeed: 680, brake: 660, grip: 14.2, driftiness: 0.12, handling: 2.7, nitroPower: 380, nitroCapacity: 120, nitroRegen: 8, armor: 0.04, mass: 1.05 },
  }),
  rally: car('rally', {
    name: 'Gravel Ghost',
    category: 'Rally',
    price: 15000,
    color: '#6ee7a8',
    accent: '#e4fff2',
    spoiler: true,
    description: 'Long-travel suspension and sticky tires. The best choice when you leave the tarmac.',
    stats: { accel: 470, topSpeed: 590, brake: 600, grip: 12.6, driftiness: 0.45, handling: 2.8, nitroPower: 340, nitroCapacity: 130, nitroRegen: 10, armor: 0.14, mass: 1.1 },
  }),
  hyper: car('hyper', {
    name: 'Phantom X',
    category: 'Hyper',
    price: 28000,
    color: '#b98cff',
    accent: '#f1e8ff',
    spoiler: true,
    description: 'Eye-watering speed and a giant nitro reserve. Respect the throttle.',
    stats: { accel: 640, topSpeed: 790, brake: 700, grip: 15.0, driftiness: 0.28, handling: 2.9, nitroPower: 430, nitroCapacity: 170, nitroRegen: 11, armor: 0.08, mass: 1.0 },
  }),
};

export const CAR_LIST = Object.values(CAR_TYPES);
export const CAR_IDS = Object.keys(CAR_TYPES);

export const getCarType = (id) => CAR_TYPES[id] ?? CAR_TYPES.starter;
