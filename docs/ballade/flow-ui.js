/* Troubadour Ballade: its helpers, made by the shared kernel (../shared/troubadour-ui.js) so the library, the
 * player and the builder behave like every other Troubadour app. Only what is Ballade's own is written here. */
(function (global) {
  'use strict';
  global.FlowUI = global.TroubadourUI.make({
    key: 'troubadour.flow.settings',
    defaults: { theme: 'obsidian', mode: 'dark', fade: 4000, awake: true, silent: true, master: 0.8, sbVolume: 0.8, autoNext: false, clock: 10, even: true },
    // After a call, a lock or a switch of app, the sound comes back on its own, unless the troubadour paused it.
    guard: () => !(global.FlowPlayer && global.FlowPlayer.isPaused && global.FlowPlayer.isPaused()),
  });
})(window);
