/* Troubadour Map: its helpers, made by the shared kernel (../shared/troubadour-ui.js) so the library, the map
 * and its panels behave like every other Troubadour app. Only what is Map's own is written here. */
(function (global) {
  'use strict';
  const { svg } = global.TroubadourUI;
  const ICON = {
    // The save state of the editor, as in Troubadour: a phone with a check, or a disk when saving failed.
    savedOk: svg('<path d="M16.5 13.5V5A2.5 2.5 0 0 0 14 2.5H8A2.5 2.5 0 0 0 5.5 5v14A2.5 2.5 0 0 0 8 21.5h3.2"/><path d="M13.6 18l2.7 2.7 5.4-6.2" stroke-width="2.1"/>', 21),
    saveDisk: svg('<path d="M5 3.5h11.5L20.5 7.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path d="M8 3.5v5h7.5v-5M7.5 20.5v-6.5h9v6.5"/>', 19),
    // The soundbox of a world, in the editor: Troubadour's book with a star.
    bookStar: '<svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.4c-2-1.4-5.5-1.9-9-1.2v12.6c3.5-.7 7-.2 9 1.2 2-1.4 5.5-1.9 9-1.2V5.2c-3.5-.7-7-.2-9 1.2z"/><path d="M12.00 9.40L12.79 11.51L15.04 11.61L13.28 13.02L13.88 15.19L12.00 13.95L10.12 15.19L10.72 13.02L8.96 11.61L11.21 11.51Z" fill="var(--music)" stroke="var(--music)" stroke-width="0.6"/></svg>',
    eye: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>', 16),
    eyeOff: svg('<path d="M4 4l16 16M9.9 5.8A10.6 10.6 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3 3.7M14.5 14.6A3.5 3.5 0 0 1 9.4 9.5M6.3 7.7A16.500 16.500 0 0 0 2 12s3.600 6.500 10 6.500a10.300 10.300 0 0 0 4.200-.900"/>', 16),
    lock: svg('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 16),
    unlock: svg('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.4-2.100"/>', 16),
    layers: svg('<path d="M12 3.500 21 8l-9 4.500L3 8z"/><path d="M3.500 12.200 12 16.500l8.500-4.300M3.500 16.200 12 20.500l8.500-4.300"/>', 19),
    minus: svg('<path d="M5 12h14"/>', 16),
    grip: svg('<circle cx="9" cy="6" r="1.300" fill="currentColor"/><circle cx="15" cy="6" r="1.300" fill="currentColor"/><circle cx="9" cy="12" r="1.300" fill="currentColor"/><circle cx="15" cy="12" r="1.300" fill="currentColor"/><circle cx="9" cy="18" r="1.300" fill="currentColor"/><circle cx="15" cy="18" r="1.300" fill="currentColor"/>', 14),
    copy: svg('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>', 16),
    turn: svg('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>', 16),
    grow: svg('<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>', 16),
    hand: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.3 14a1.5 1.5 0 0 1 2.4-1.8L8 15"/>', 18),
    select: svg('<path d="M5 3.5l13 7.2-5.6 1.5 3.4 6.3-2.4 1.3-3.4-6.3L5.6 17z"/>', 18),
    wall: svg('<path d="M3 6h18v12H3z"/><path d="M3 12h18M9 6v6M15 6v6M6 12v6M12 12v6M18 12v6"/>', 18),
    pen: svg('<path d="M4 20c3-1 5-4 7-7s5-7 9-8"/><path d="M16 4.5l3.5 3.5"/><circle cx="4" cy="20" r="1.2" fill="currentColor"/>', 18),
    stamp: svg('<path d="M3 19l6-10 4 6 3-4 5 8z"/><circle cx="17" cy="6" r="2"/>', 18),
    eraser: svg('<path d="M15 4l5 5-9.5 9.5H6L3.5 16a1.5 1.5 0 0 1 0-2.1z"/><path d="M10 9l5 5M6 18.5h14"/>', 18),
    player: svg('<circle cx="12" cy="12" r="3.2" fill="currentColor"/><circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>', 18),
    link: svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>', 16),
    listen: svg('<path d="M4 14.5V12a8 8 0 0 1 16 0v2.5"/><rect x="3.5" y="13.5" width="4" height="6.5" rx="1.6"/><rect x="16.5" y="13.5" width="4" height="6.5" rx="1.6"/>', 18),
    redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>', 18),
    keys: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>', 18),
    shrink: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>', 18),
    // The music menu in full screen (not the map's frame: arrows out and in).
    expand: svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>', 18),
    collapse: svg('<path d="M20 10h-6V4M4 14h6v6M14 10l6.5-6.5M10 14l-6.5 6.5"/>', 18),
    // Where: on the place (a dot), in its hearing circle (a dashed circle).
    onPlace: svg('<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>', 22),
    inCircle: svg('<circle cx="12" cy="12" r="8.5" stroke-dasharray="3.2 2.6"/>', 22),
    fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 18),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', 18),
    // The Sounds button: a folded map with a speaker on it (the sounds of the map).
    sound: svg('<g stroke-width="1.7"><path d="M2.5 6 8.5 3.6l7 2.4 6-2.4v14.4l-6 2.4-7-2.4-6 2.4z"/><path d="M8.5 3.6v1.6M15.5 6v1.5M8.5 18v-.9M15.5 20.4v-2"/><path d="M5.8 10.4h1.8l2.7-2.2v7.6l-2.7-2.2H5.8z"/><path d="M12.6 10.35a2.3 2.3 0 0 1 0 3.3M14.01 8.66a4.5 4.5 0 0 1 0 6.68"/></g>', 19),
    globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>', 16),
    radius: svg('<circle cx="12" cy="12" r="8.5" stroke-dasharray="2.6 2.6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 12h8.5"/>', 16),
    volDown: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 12h5"/>', 15),
    volUp: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 12h5M18.5 9.5v5"/>', 15),
    book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 11.5h5"/>', 19),
    after: svg('<path d="M4 6h12M4 11h9M4 16h6M15 13v7l6-3.5z"/>', 15),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16),
    chevron: svg('<path d="M9 6l6 6-6 6"/>', 14),
    pin: svg('<path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', 13),
    starFill: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', 16, true),
    left: svg('<path d="M15 18l-6-6 6-6"/>', 14),
    right: svg('<path d="M9 18l6-6-6-6"/>', 14),
    files: svg('<path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>', 18),
    stopMusic: svg('<rect x="3.5" y="3.5" width="12" height="12" rx="2" fill="currentColor" stroke="none"/><path d="M20.5 13.2v6.1"/><circle cx="18.6" cy="19.5" r="1.9" fill="currentColor" stroke="none"/><path d="M20.5 13.2l1.6.8"/>', 18),
    queue: svg('<path d="M4 6h16M4 11h16M4 16h9"/><path d="M16.5 14v6l5-3z"/>', 17),
    queueAdd: svg('<path d="M4 6h12M4 11h12M4 16h7"/><path d="M18 13v7M14.5 16.5h7"/>', 17),
    music: svg('<path d="M9 18V5.5l11-2.5v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>', 17),
  };
  global.MapUI = global.TroubadourUI.make({
    key: 'troubadour.map.settings',
    defaults: { theme: 'obsidian', mode: 'dark', fade: 4000, fadeIn: 2000, crossfade: true, randomMax: 17, life: true, lifeEvery: 13, awake: true, silent: true, master: 0.8, sbVolume: 0.8, rings: true, heardRings: true, trail: true, trailSpeed: 0.1, speeds: 2, trailWalls: true, portrait: false, pins: [], placeSize: 'auto', names: true, ground: 'grid', even: true, musicSuggest: true, musicAuto: true, musicWait: 5, musicIn: 'place', musicStop: true, musicOut: 'circle', musicFull: false, musicQueue: false, vol: { music: 'simple', ambience: 'simple', events: 'simple' } },
    icons: ICON,
    migrate(out, saved) {
      // Walking speeds were halved (Nov 2026): a speed kept from before walks at half its old pace.
      if (saved.trailSpeed != null && saved.speeds !== 2) out.trailSpeed = (+saved.trailSpeed || 0.2) / 2;
      out.speeds = 2;
    },
  });
})(window);
