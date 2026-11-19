/* Troubadour Ballade: its helpers, made by the shared kernel (../shared/troubadour-ui.js) so the library, the
 * player and the builder behave like every other Troubadour app. Only what is Ballade's own is written here. */
(function (global) {
  'use strict';
  global.FlowUI = global.TroubadourUI.make({
    key: 'troubadour.flow.settings',
    defaults: { theme: 'obsidian', mode: 'dark', fade: 4000, awake: true, silent: true, master: 0.8, sbVolume: 0.8, autoNext: false, clock: 10, even: true },
    // After a call, a lock or a switch of app, the sound comes back on its own, unless the troubadour paused it.
    icons: {
      undo: global.TroubadourUI.svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', 18),
      redo: global.TroubadourUI.svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>', 18),
    },
    guard: () => !(global.FlowPlayer && global.FlowPlayer.isPaused && global.FlowPlayer.isPaused()),
  });
})(window);
