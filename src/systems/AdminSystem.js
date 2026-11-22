/**
 * Admin console commands. Commands are pure functions over a `ctx` object so
 * they can be tested in Node without a browser.
 */

import { clamp } from '../core/MathUtils.js';
import { CAR_IDS, CAR_TYPES } from '../entities/CarTypes.js';
import { PART_IDS, getPart } from './UpgradeSystem.js';
import { TRACK_IDS } from '../world/Tracks.js';

function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  return parsed;
}

function onOff(value, fallback = true) {
  if (value === undefined) return fallback;
  if (['on', 'true', '1', 'yes'].includes(String(value).toLowerCase())) return true;
  if (['off', 'false', '0', 'no'].includes(String(value).toLowerCase())) return false;
  throw new Error('Use on or off.');
}

const toggle = (label, apply) => (ctx, args) => {
  const enabled = onOff(args[0], !ctx.game.adminState[label]);
  apply(ctx, enabled);
  return { ok: true, message: `${label} ${enabled ? 'enabled' : 'disabled'}.` };
};

export const COMMANDS = [
  {
    name: 'help',
    aliases: ['?'],
    usage: '/help',
    desc: 'List every admin command.',
    run: () => ({
      ok: true,
      message: ['ADMIN COMMANDS', ...COMMANDS.map((c) => `  ${c.usage.padEnd(34)} ${c.desc}`)].join('\n'),
    }),
  },
  {
    name: 'credits',
    usage: '/credits <amount>',
    desc: 'Add (or subtract) credits.',
    run: (ctx, args) => {
      const amount = Math.floor(number(args[0], 'Amount'));
      ctx.profile.credits = Math.max(0, ctx.profile.credits + amount);
      ctx.game.saveProfile();
      ctx.ui.refreshAll();
      return { ok: true, message: `Credits: ${ctx.profile.credits}.` };
    },
  },
  {
    name: 'car',
    usage: '/car <starter|drift|racecar|rally|hyper>',
    desc: 'Swap the player car instantly.',
    run: (ctx, args) => {
      const id = String(args[0] ?? '').toLowerCase();
      if (!CAR_TYPES[id]) return { ok: false, message: `Unknown car. Options: ${CAR_IDS.join(', ')}.` };
      ctx.game.setPlayerCar(id);
      return { ok: true, message: `Player car set to ${CAR_TYPES[id].name}.` };
    },
  },
  {
    name: 'cars',
    usage: '/cars',
    desc: 'List active cars and their ids.',
    run: (ctx) => ({
      ok: true,
      message: ctx.game.cars.map((car) => `  ${car.id.padEnd(10)} ${car.name}${car.isPlayer ? '  (you)' : ''}`).join('\n'),
    }),
  },
  {
    name: 'spawn',
    usage: '/spawn <carId> [x] [y]',
    desc: 'Spawn an AI car (defaults beside you).',
    run: (ctx, args) => {
      const id = String(args[0] ?? '').toLowerCase();
      if (!CAR_TYPES[id]) return { ok: false, message: `Unknown car. Options: ${CAR_IDS.join(', ')}.` };
      const player = ctx.game.player;
      const x = args[1] === undefined ? player.x + 110 : number(args[1], 'X');
      const y = args[2] === undefined ? player.y + 110 : number(args[2], 'Y');
      const car = ctx.game.spawnAI(id, x, y);
      return { ok: true, message: `Spawned ${car.name} (${car.id}).` };
    },
  },
  {
    name: 'kick',
    usage: '/kick <carId>',
    desc: 'Remove a car. See /cars for ids.',
    run: (ctx, args) => {
      const id = args[0];
      if (!id) return { ok: false, message: 'Provide a car id from /cars.' };
      if (!ctx.game.removeCar(id)) return { ok: false, message: `No car with id '${id}'.` };
      return { ok: true, message: `Removed ${id}.` };
    },
  },
  {
    name: 'tp',
    usage: '/tp <x> <y> | /tp cp <index>',
    desc: 'Teleport the player.',
    run: (ctx, args) => {
      const player = ctx.game.player;
      if (String(args[0] ?? '').toLowerCase() === 'cp') {
        const gates = ctx.track.checkpoints;
        const index = ((Math.floor(number(args[1], 'Checkpoint')) % gates.length) + gates.length) % gates.length;
        const gate = gates[index];
        player.x = player.prevX = gate.x;
        player.y = player.prevY = gate.y;
        player.angle = Math.atan2(gate.ty, gate.tx);
      } else {
        player.x = player.prevX = number(args[0], 'X');
        player.y = player.prevY = number(args[1], 'Y');
      }
      player.vx = player.vy = 0;
      player.drift = 0;
      return { ok: true, message: `Teleported to ${Math.round(player.x)}, ${Math.round(player.y)}.` };
    },
  },
  {
    name: 'heal',
    aliases: ['repair'],
    usage: '/heal',
    desc: 'Restore health and nitro.',
    run: (ctx) => {
      ctx.player.health = 100;
      ctx.player.nitro = ctx.player.stats.nitroCapacity;
      return { ok: true, message: 'Car repaired.' };
    },
  },
  {
    name: 'god',
    usage: '/god [on|off]',
    desc: 'Invulnerable player (default: toggle).',
    run: toggle('god', (ctx, value) => {
      ctx.game.adminState.god = value;
      ctx.player.god = value;
    }),
  },
  {
    name: 'noclip',
    usage: '/noclip [on|off]',
    desc: 'Ignore all collisions (default: toggle).',
    run: toggle('noclip', (ctx, value) => {
      ctx.game.adminState.noclip = value;
      ctx.player.noclip = value;
      for (const car of ctx.game.cars) car.noclip = value;
    }),
  },
  {
    name: 'boost',
    usage: '/boost <seconds|off>',
    desc: 'Unlimited nitro for a duration.',
    run: (ctx, args) => {
      if (String(args[0] ?? '').toLowerCase() === 'off') {
        ctx.game.adminState.boostUntil = 0;
        ctx.player.infiniteNitro = false;
        return { ok: true, message: 'Boost disabled.' };
      }
      const seconds = Math.max(0, number(args[0], 'Seconds'));
      ctx.game.adminState.boostUntil = Date.now() + seconds * 1000;
      ctx.player.infiniteNitro = true;
      return { ok: true, message: `Boost active for ${seconds}s.` };
    },
  },
  {
    name: 'speed',
    usage: '/speed <px/s>',
    desc: 'Set player velocity.',
    run: (ctx, args) => {
      const value = number(args[0], 'Speed');
      ctx.player.vx = Math.cos(ctx.player.angle) * value;
      ctx.player.vy = Math.sin(ctx.player.angle) * value;
      return { ok: true, message: `Speed set to ${value.toFixed(0)}.` };
    },
  },
  {
    name: 'lap',
    usage: '/lap <number>',
    desc: 'Jump the player to a lap.',
    run: (ctx, args) => {
      ctx.player.lap = Math.max(0, Math.floor(number(args[0], 'Lap')));
      ctx.player.nextCheckpoint = 1;
      ctx.race.updateStandings();
      return { ok: true, message: `Lap set to ${ctx.player.lap}.` };
    },
  },
  {
    name: 'resetlap',
    usage: '/resetlap',
    desc: 'Reset the race clock.',
    run: (ctx) => {
      ctx.race.time = 0;
      ctx.player.lapStartTime = 0;
      return { ok: true, message: 'Race clock reset.' };
    },
  },
  {
    name: 'time',
    usage: '/time <seconds>',
    desc: 'Set the race clock.',
    run: (ctx, args) => {
      ctx.race.time = Math.max(0, number(args[0], 'Seconds'));
      return { ok: true, message: `Clock set to ${ctx.race.time.toFixed(1)}s.` };
    },
  },
  {
    name: 'ai',
    usage: '/ai <count>',
    desc: 'Set the number of opponents (0-7).',
    run: (ctx, args) => {
      const count = Math.floor(number(args[0], 'Count'));
      ctx.game.setAiCount(count);
      return { ok: true, message: `Opponents set to ${ctx.game.cars.length - 1}.` };
    },
  },
  {
    name: 'driftscore',
    usage: '/driftscore <points>',
    desc: 'Set the player drift score.',
    run: (ctx, args) => {
      ctx.player.driftScore = Math.max(0, number(args[0], 'Score'));
      return { ok: true, message: `Drift score set to ${Math.floor(ctx.player.driftScore)}.` };
    },
  },
  {
    name: 'upgrades',
    usage: '/upgrades <part> <level>',
    desc: 'Set an upgrade level for free.',
    run: (ctx, args) => {
      const id = String(args[0] ?? '').toLowerCase();
      const part = getPart(id);
      if (!part) return { ok: false, message: `Unknown part. Options: ${PART_IDS.join(', ')}.` };
      const level = Math.floor(number(args[1], 'Level'));
      const levels = ctx.profile.upgrades[ctx.profile.selectedCar] ?? (ctx.profile.upgrades[ctx.profile.selectedCar] = {});
      levels[id] = clamp(level, 0, part.max);
      ctx.game.rebuildPlayerCar();
      ctx.game.saveProfile();
      ctx.ui.refreshAll();
      return { ok: true, message: `${part.name} set to level ${levels[id]}.` };
    },
  },
  {
    name: 'track',
    usage: '/track <neon|harbor|speedway>',
    desc: 'Restart on another track.',
    run: (ctx, args) => {
      const id = String(args[0] ?? '').toLowerCase();
      if (!TRACK_IDS.includes(id)) return { ok: false, message: `Unknown track. Options: ${TRACK_IDS.join(', ')}.` };
      ctx.game.startRace({ trackId: id });
      return { ok: true, message: `Switched to ${ctx.track.name}.` };
    },
  },
  {
    name: 'flip',
    usage: '/flip',
    desc: 'Flip the player around.',
    run: (ctx) => {
      ctx.player.angle += Math.PI;
      ctx.player.vx = ctx.player.vy = 0;
      return { ok: true, message: 'Car flipped.' };
    },
  },
  {
    name: 'fps',
    usage: '/fps [on|off]',
    desc: 'Toggle the FPS counter.',
    run: toggle('showFps', (ctx, value) => {
      ctx.game.adminState.showFps = value;
      ctx.game.settings.showFps = value;
      ctx.ui.refreshAll();
    }),
  },
  {
    name: 'save',
    usage: '/save',
    desc: 'Write progress to storage.',
    run: (ctx) => ({ ok: true, message: ctx.game.saveProfile() ? 'Progress saved.' : 'Storage unavailable.' }),
  },
  {
    name: 'reset',
    usage: '/reset',
    desc: 'Wipe credits, cars and upgrades.',
    run: (ctx) => {
      ctx.game.resetProfile();
      return { ok: true, message: 'Progress reset to defaults.' };
    },
  },
  {
    name: 'clear',
    usage: '/clear',
    desc: 'Clear the console output.',
    run: () => ({ ok: true, message: '', clear: true }),
  },
];

export class AdminSystem {
  constructor(commands = COMMANDS) {
    this.commands = commands;
  }

  contextString() {
    return COMMANDS.map((command) => `${command.usage.padEnd(34)}${command.desc}`).join('\n');
  }

  execute(line, ctx) {
    const raw = String(line ?? '').trim();
    if (!raw) return { ok: false, message: 'Enter a command. Try /help.' };
    const parts = raw.replace(/^\//, '').split(/\s+/).filter(Boolean);
    const name = parts.shift().toLowerCase();
    const command = this.commands.find((entry) => entry.name === name || entry.aliases?.includes(name));
    if (!command) return { ok: false, message: `Unknown command '${name}'. Try /help.` };

    try {
      return command.run(ctx, parts) ?? { ok: true, message: '' };
    } catch (error) {
      return { ok: false, message: error?.message ?? 'Command failed.' };
    }
  }
}
