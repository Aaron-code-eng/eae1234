/** Entry point. Everything else is an ES module with no global side effects. */

import { Game } from './core/Game.js';

function boot() {
  const canvas = document.getElementById('game');
  // Exposed for debugging and for the in-game admin console.
  window.game = new Game({ canvas });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
