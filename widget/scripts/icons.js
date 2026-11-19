// Own line icons (24×24, stroke = currentColor). Picked per domain / device class in entities.js.
var HomedeckIcons = (function () {
  'use strict';

  var P = {
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2h5c0-.8.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    toggle: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="16.5" cy="12" r="2.6"/>',
    plug: '<path d="M9 3v5M15 3v5"/><path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5V21"/>',
    fan: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C11 7 11.5 3.5 14 3.5c2.2 0 2.4 3.4-.6 6.4M13.6 12c3.4-1 6.9-.5 6.9 2 0 2.2-3.4 2.4-6.4-.6M12 13.6c1 3.4.5 6.9-2 6.9-2.2 0-2.4-3.4.6-6.4M10.4 12C7 13 3.5 12.5 3.5 10c0-2.2 3.4-2.4 6.4.6"/>',
    thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
    drop: '<path d="M12 3.2s6 6.3 6 10.6a6 6 0 0 1-12 0c0-4.3 6-10.6 6-10.6z"/>',
    bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
    battery: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><path d="M6 10v4M9 10v4"/>',
    gauge: '<path d="M4.2 17a8.5 8.5 0 1 1 15.6 0"/><path d="M12 13l4-4"/><circle cx="12" cy="13" r="1.3"/>',
    door: '<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21"/><path d="M3.5 21h17"/><circle cx="14.5" cy="12.5" r=".9"/>',
    window: '<rect x="4.5" y="3.5" width="15" height="17" rx="1.5"/><path d="M12 3.5v17M4.5 12h15"/>',
    motion: '<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6 3 3v3M8 11l3-3.5 3 2 2.5 3.5M12 15l-1-6.5"/><path d="M8 11l-2.5 1"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>',
    blind: '<path d="M4 3.5h16M5 3.5v11h14v-11"/><path d="M5 7h14M5 10.5h14"/><path d="M12 14.5v3"/><circle cx="12" cy="19" r="1.3"/>',
    flame: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3.5-6-3.5-10C12 7 9 8.5 9 12a3 3 0 0 1-2-2.5A6.5 6.5 0 0 0 6 15a6 6 0 0 0 6 6z"/>',
    climate: '<path d="M12 2.5v19M4 7l16 10M20 7L4 17"/><path d="M9.5 4L12 6.5 14.5 4M9.5 20l2.5-2.5 2.5 2.5"/>',
    media: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/><path d="M10.5 8.5v5l4-2.5z"/>',
    person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    scene: '<path d="M12 3l1.8 4.6L18.5 9l-4 3 1.3 5L12 14.3 8.2 17l1.3-5-4-3 4.7-1.4z"/>',
    script: '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6M13.5 4l-3 16"/>',
    button: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.5 1.7A3.7 3.7 0 0 1 17.5 18.5z"/>',
    co2: '<path d="M4 14.5a3.5 3.5 0 0 1 2.4-6.1 5.5 5.5 0 0 1 10.4 1.1 3 3 0 0 1 .7 5.9"/><path d="M8 18.5h8M10 21.5h4"/>',
    light_lux: '<circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/>',
    number: '<path d="M9 4L7 20M17 4l-2 16M4.5 9h16M3.5 15h16"/>',
    vacuum: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M7 7.5h10"/>',
    alert: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.2"/>',
    home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    dot: '<circle cx="12" cy="12" r="5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    power: '<path d="M12 3v8"/><path d="M6.6 6.6a7.5 7.5 0 1 0 10.8 0"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    prev: '<path d="M6 5v14"/><path d="M19 5l-10 7 10 7z"/>',
    next: '<path d="M18 5v14"/><path d="M5 5l10 7-10 7z"/>',
    playpause: '<path d="M4 5l9 7-9 7z"/><path d="M16 5v14M20 5v14"/>',
    up: '<path d="M5 15l7-7 7 7"/>',
    down: '<path d="M5 9l7 7 7-7"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
    tune: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'
  };

  function svg(name) {
    var body = P[name] || P.dot;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  return { svg: svg, has: function (n) { return !!P[n]; } };
})();
