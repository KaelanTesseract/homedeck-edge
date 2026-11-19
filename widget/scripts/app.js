// Homedeck – your own Home Assistant entities as live tiles on the Xeneon Edge.
// Data comes straight from the user's HA server over WebSocket (ha-client.js); the page only renders.

// iCUE API binding – bare assignment is intentional (see lifecycle reference).
// iCUE injects every setting (haUrl, haToken, ...) as a global variable: no global function or
// variable in these scripts may share a name with a setting in index.html.
icueEvents = {
  onDataUpdated: onIcueDataUpdated,
  onICUEInitialized: onIcueInitialized
};

var t = HomedeckI18n.t;
var $ = function (id) { return document.getElementById(id); };

var app = {
  started: false,
  demo: false,
  ids: [],
  states: {},          // id -> HA state | null (not found); missing key = not loaded yet
  status: 'idle',      // idle | connecting | live | offline | demo
  problem: null,       // setup | noEntities | badUrl | auth | unreachable
  hadData: false,
  tiles: {},
  client: null,
  media: null,
  tapEnabled: true
};

function getIcueProperty(name) {
  if (typeof window !== 'undefined' && Object.prototype.hasOwnProperty.call(window, name)) {
    var value = window[name];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  try {
    var v = Function('return typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined')();
    if (v !== undefined && v !== null && v !== '') return v;
  } catch (e) {}
  return undefined;
}

function prop(name, fallback) {
  var v = getIcueProperty(name);
  return v === undefined ? fallback : v;
}

function boolProp(name, fallback) {
  var v = getIcueProperty(name);
  if (v === undefined) return fallback;
  return v === true || v === 'true' || v === 1 || v === '1';
}

// ---------- personalization ----------

function applyAppearance() {
  var root = $('root');
  var s = root.style;
  s.setProperty('--text-color', prop('textColor', '#f2f4f7'));
  s.setProperty('--accent-color', prop('accentColor', '#ffb45e'));
  s.setProperty('--bg-color', prop('backgroundColor', '#000000'));
  var transparency = Number(prop('transparency', 0)) || 0;
  s.setProperty('--bg-opacity', String(1 - Math.max(0, Math.min(100, transparency)) / 100));
  var blur = Number(prop('glassBlur', 0)) || 0;
  s.setProperty('--glass-blur', blur + 'px');
  root.classList.toggle('has-glass', blur > 0);
  var bright = Number(prop('bgBrightness', 70)) || 70;
  s.setProperty('--bg-brightness', String(bright / 100));
  if (!app.media) app.media = new HomedeckMedia.MediaBackground($('media-background'));
  app.media.show(getIcueProperty('backgroundMedia'));
  root.classList.toggle('no-status', !boolProp('showStatusBar', true));
  app.tapEnabled = boolProp('tapToToggle', true);
  root.classList.toggle('tap-enabled', app.tapEnabled);
  if (!app.tapEnabled) closePanel();
}

// ---------- connection ----------

function applyConnection() {
  if (app.demo) return;
  var ids = HomedeckEntities.parseList(prop('haEntities', ''));
  var address = String(prop('haUrl', '')).trim();
  var token = String(prop('haToken', '')).trim();
  var idsChanged = ids.join(',') !== app.ids.join(',');
  app.ids = ids;
  if (idsChanged) buildTiles();

  if (!address || !token) { stopClient('setup'); return; }
  if (!ids.length) { stopClient('noEntities'); return; }
  var wsUrl = HomedeckClient.toWsUrl(address);
  if (!wsUrl) { stopClient('badUrl'); return; }

  if (!app.client) {
    app.client = new HomedeckClient.Client({
      onStatus: function (st) {
        if (st === 'connecting') setStatus(app.hadData ? 'reconnecting' : 'connecting');
        if (st === 'live') { app.problem = null; setStatus('live'); }
      },
      onStates: function (map, initial) {
        app.states = map;
        app.hadData = true;
        if (initial) app.problem = null;
        renderAll();
      },
      onError: function (kind) {
        if (kind === 'auth') { app.problem = 'auth'; setStatus('offline'); }
        else { if (!app.hadData) app.problem = 'unreachable'; setStatus('offline'); }
      }
    });
  }
  if (idsChanged) { app.states = {}; app.hadData = false; }
  app.client.configure(wsUrl, token, ids);
}

function stopClient(problem) {
  if (app.client) app.client.stop();
  app.problem = problem;
  app.states = {};
  app.hadData = false;
  setStatus('idle');
}

function setStatus(status) {
  if (app.status === status) { renderChrome(); return; }
  app.status = status;
  if (status !== 'live') closePanel();
  renderAll(); // tiles too: tapping is only possible while live
}

// ---------- tiles ----------

function buildTiles() {
  var board = $('board');
  board.textContent = '';
  app.tiles = {};
  app.ids.forEach(function (id) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'tile';
    el.innerHTML =
      '<span class="tile-head"><span class="tile-icon"></span><span class="tile-sub"></span>' +
      '<span class="tile-tune">' + HomedeckIcons.svg('tune') + '</span></span>' +
      '<span class="tile-value"><span class="v"></span><span class="u"></span></span>' +
      '<span class="tile-name"></span>' +
      '<span class="tile-bar"><i></i></span>';
    bindPress(el, id);
    board.appendChild(el);
    app.tiles[id] = {
      el: el, icon: el.querySelector('.tile-icon'), sub: el.querySelector('.tile-sub'),
      v: el.querySelector('.v'), u: el.querySelector('.u'), name: el.querySelector('.tile-name'),
      iconName: null, last: null
    };
  });
  layoutGrid();
  renderAll();
}

/** Picks columns/rows so tiles are as large as possible with a pleasant (slightly wide) shape. */
function layoutGrid() {
  var board = $('board');
  var n = Math.max(1, app.ids.length);
  var r = board.getBoundingClientRect();
  var W = r.width, H = r.height;
  if (!W || !H) return;
  var gap = parseFloat(getComputedStyle(board).columnGap) || 0;
  var best = { score: -1, cols: 1, rows: n };
  for (var cols = 1; cols <= n; cols++) {
    var rows = Math.ceil(n / cols);
    if ((cols - 1) * rows >= n && cols > 1) continue; // a whole column would stay empty
    var tw = (W - gap * (cols - 1)) / cols;
    var th = (H - gap * (rows - 1)) / rows;
    if (tw <= 0 || th <= 0) continue;
    var score = Math.min(tw / 1.35, th);
    var aspect = tw / th;
    if (aspect > 2.8) score *= 2.8 / aspect;     // very flat strips read badly
    if (aspect < 0.75) score *= aspect / 0.75;   // and so do tall slivers
    if (score > best.score) best = { score: score, cols: cols, rows: rows };
  }
  board.style.setProperty('--cols', best.cols);
  board.style.setProperty('--rows', best.rows);
}

function renderAll() {
  app.ids.forEach(renderTile);
  renderChrome();
}

function renderTile(id) {
  var tile = app.tiles[id];
  if (!tile) return;
  var st = Object.prototype.hasOwnProperty.call(app.states, id) ? app.states[id] : undefined;
  if (st === undefined && !HomedeckEntities.isValidId(id)) st = null;
  var d = HomedeckEntities.describe(id, st);
  var el = tile.el;
  el.dataset.kind = d.kind;
  el.dataset.domain = HomedeckEntities.domainOf(id);
  el.classList.toggle('is-on', !!d.active);
  var panel = HomedeckControls.panelFor(id, st);
  el.classList.toggle('can-tap', !!d.action || !!panel);
  el.classList.toggle('has-panel', !!panel);
  el.disabled = !(app.tapEnabled && (d.action || panel) && (app.status === 'live' || app.demo));
  if (tile.iconName !== d.icon) { tile.icon.innerHTML = HomedeckIcons.svg(d.icon); tile.iconName = d.icon; }
  tile.v.textContent = d.value || '';
  tile.u.textContent = d.unit || '';
  tile.name.textContent = d.name;
  tile.sub.textContent = d.sub || '';
  el.style.setProperty('--level', d.level == null ? '0' : String(d.level / 100));
  el.classList.toggle('has-level', d.level != null);
  if (d.tint) el.style.setProperty('--tint', d.tint); else el.style.removeProperty('--tint');
  if (d.hue) el.style.setProperty('--hue', d.hue); else el.style.removeProperty('--hue');
  el.setAttribute('aria-label', d.name + ': ' + (d.value || '') + (d.unit ? ' ' + d.unit : ''));
  tile.last = d;
  tile.panel = panel;
  if (app.panel && app.panel.id === id) app.panel.update(st);
}

// ---------- tap / long press ----------

var LONG_PRESS_MS = 450;

function bindPress(el, id) {
  var timer = null, longFired = false, x0 = 0, y0 = 0;
  el.addEventListener('pointerdown', function (ev) {
    longFired = false;
    x0 = ev.clientX; y0 = ev.clientY;
    clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      if (openPanel(id)) longFired = true;
    }, LONG_PRESS_MS);
  });
  var cancel = function () { clearTimeout(timer); timer = null; };
  el.addEventListener('pointermove', function (ev) {
    if (timer && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 14) cancel();
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  el.addEventListener('click', function () {
    if (longFired) { longFired = false; return; } // the long press already opened the panel
    onTap(id);
  });
}

function openPanel(id) {
  var tile = app.tiles[id];
  if (!tile || !tile.panel || !app.tapEnabled || !(app.status === 'live' || app.demo)) return false;
  if (!app.panel) app.panel = new HomedeckControls.Panel($('panel'), panelCall);
  return app.panel.open(id, app.states[id]);
}

function closePanel() { if (app.panel) app.panel.close(); }

/** Service call from the control panel. */
function panelCall(domain, service, data, id) {
  if (app.demo) { demoApply(id, service, data || {}); return; }
  if (app.client) app.client.callService({ domain: domain, service: service, data: data }, id, function (res) {
    if (!res.success && app.tiles[id]) { var el = app.tiles[id].el; el.classList.remove('tap-failed'); void el.offsetWidth; el.classList.add('tap-failed'); }
  });
}

function onTap(id) {
  var tile = app.tiles[id];
  if (!tile || !tile.last || !app.tapEnabled) return;
  if (!tile.last.action) { openPanel(id); return; } // climate, numbers: a tap opens the panel
  var el = tile.el;
  el.classList.remove('tap-failed');
  el.classList.add('is-pending');
  var done = function (ok) {
    el.classList.remove('is-pending');
    if (!ok) { void el.offsetWidth; el.classList.add('tap-failed'); }
  };
  if (app.demo) { demoToggle(id); setTimeout(function () { done(true); }, 250); return; }
  var sent = app.client && app.client.callService(tile.last.action, id, function (res) { done(!!res.success); });
  if (!sent) done(false);
  setTimeout(function () { el.classList.remove('is-pending'); }, 4000);
}

// ---------- status bar and notices ----------

function renderChrome() {
  var root = $('root');
  var problem = app.demo ? null : app.problem;
  var state = problem ? 'problem' : app.status === 'live' || app.demo ? 'live'
    : app.hadData ? 'offline' : 'loading';
  root.dataset.state = state;

  var dot = $('status-dot');
  dot.className = 'status-dot is-' + (app.demo ? 'demo' : app.status);
  var label = app.demo ? t('demo')
    : app.status === 'live' ? t('live')
    : app.status === 'offline' ? (app.hadData ? t('offline') : t('unreachableTitle'))
    : app.status === 'reconnecting' ? t('reconnecting') + '…'
    : t('connecting') + '…';
  $('status-text').textContent = label;
  var n = app.ids.length;
  $('status-count').textContent = n ? n + ' ' + (n === 1 ? t('entity') : t('entities')) : '';

  var notice = $('notice');
  if (!problem) { notice.hidden = true; return; }
  notice.hidden = false;
  var map = {
    setup: ['setupTitle', 'setupHint', 'home'],
    noEntities: ['noEntitiesTitle', 'noEntitiesHint', 'dot'],
    badUrl: ['badUrlTitle', 'badUrlHint', 'alert'],
    auth: ['authTitle', 'authHint', 'lock'],
    unreachable: ['unreachableTitle', 'unreachableHint', 'cloud']
  }[problem];
  $('notice-icon').innerHTML = HomedeckIcons.svg(map[2]);
  $('notice-title').textContent = t(map[0]);
  $('notice-hint').textContent = t(map[1]);
}

// ---------- demo (plain browser / iCUE preview without setup) ----------

var DEMO_IDS = ['light.living_room', 'light.kitchen', 'switch.coffee_maker', 'sensor.living_room_temperature',
  'sensor.living_room_humidity', 'sensor.house_power', 'binary_sensor.front_door', 'lock.front_door',
  'cover.office_blind', 'climate.bedroom', 'scene.movie_night', 'sensor.phone_battery'];

function demoStates() {
  var de = HomedeckI18n.lang === 'de';
  var ago = function (min) { return new Date(Date.now() - min * 60000).toISOString(); };
  return {
    'light.living_room': { state: 'on', attributes: { friendly_name: de ? 'Wohnzimmer' : 'Living room', brightness: 191, rgb_color: [255, 196, 120], supported_color_modes: ['color_temp'], color_temp_kelvin: 2700, min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 } },
    'light.kitchen': { state: 'off', attributes: { friendly_name: de ? 'Küche' : 'Kitchen', supported_color_modes: ['brightness'] } },
    'switch.coffee_maker': { state: 'on', attributes: { friendly_name: de ? 'Kaffeemaschine' : 'Coffee maker', device_class: 'outlet' } },
    'sensor.living_room_temperature': { state: '21.46', attributes: { friendly_name: de ? 'Temperatur' : 'Temperature', unit_of_measurement: '°C', device_class: 'temperature', display_precision: 1 } },
    'sensor.living_room_humidity': { state: '47', attributes: { friendly_name: de ? 'Luftfeuchte' : 'Humidity', unit_of_measurement: '%', device_class: 'humidity' } },
    'sensor.house_power': { state: '412.8', attributes: { friendly_name: de ? 'Hausverbrauch' : 'House power', unit_of_measurement: 'W', device_class: 'power' } },
    'binary_sensor.front_door': { state: 'off', last_changed: ago(14), attributes: { friendly_name: de ? 'Haustür' : 'Front door', device_class: 'door' } },
    'lock.front_door': { state: 'locked', attributes: { friendly_name: de ? 'Türschloss' : 'Door lock' } },
    'cover.office_blind': { state: 'open', attributes: { friendly_name: de ? 'Rollo Büro' : 'Office blind', current_position: 60, supported_features: 15 } },
    'climate.bedroom': { state: 'heat', attributes: { friendly_name: de ? 'Schlafzimmer' : 'Bedroom', current_temperature: 19.5, temperature: 21, hvac_action: 'heating', target_temp_step: 0.5, min_temp: 7, max_temp: 30, hvac_modes: ['off', 'heat', 'auto'], preset_modes: ['comfort', 'eco', 'away'], preset_mode: 'comfort' } },
    'scene.movie_night': { state: ago(180), attributes: { friendly_name: de ? 'Filmabend' : 'Movie night' } },
    'sensor.phone_battery': { state: '76', attributes: { friendly_name: de ? 'Handy-Akku' : 'Phone battery', unit_of_measurement: '%', device_class: 'battery' } }
  };
}

function demoToggle(id) {
  var st = app.states[id];
  if (!st) return;
  var dom = HomedeckEntities.domainOf(id);
  if (dom === 'lock') st.state = st.state === 'locked' ? 'unlocked' : 'locked';
  else if (dom === 'cover') st.state = st.state === 'open' ? 'closed' : 'open';
  else if (dom === 'scene') st.state = new Date().toISOString();
  else st.state = st.state === 'on' ? 'off' : 'on';
  renderTile(id);
}

/** Demo: applies a panel service call to the sample states. */
function demoApply(id, service, data) {
  var st = app.states[id];
  if (!st) return;
  var a = st.attributes;
  switch (service) {
    case 'toggle': demoToggle(id); return;
    case 'turn_on':
      st.state = 'on';
      if (data.brightness_pct != null) a.brightness = Math.round(data.brightness_pct * 2.55);
      if (data.color_temp_kelvin != null) { a.color_temp_kelvin = data.color_temp_kelvin; a.rgb_color = data.color_temp_kelvin > 4500 ? [235, 242, 255] : [255, 196, 120]; }
      break;
    case 'set_temperature': Object.assign(a, data); break;
    case 'set_hvac_mode': st.state = data.hvac_mode; break;
    case 'set_preset_mode': a.preset_mode = data.preset_mode; break;
    case 'set_cover_position': a.current_position = data.position; st.state = data.position > 0 ? 'open' : 'closed'; break;
    case 'open_cover': a.current_position = 100; st.state = 'open'; break;
    case 'close_cover': a.current_position = 0; st.state = 'closed'; break;
  }
  renderTile(id);
}

function startDemo() {
  app.demo = true;
  var all = demoStates();
  var count = Number((location.hash.match(/count=(\d+)/) || [])[1]) || DEMO_IDS.length;
  var ids = DEMO_IDS.slice(0, Math.max(1, Math.min(count, DEMO_IDS.length)));
  if (/missing/.test(location.hash)) ids.push('sensor.does_not_exist');
  app.ids = ids;
  app.states = {};
  ids.forEach(function (id) { app.states[id] = all[id] || null; });
  app.hadData = true;
  buildTiles();
  var panelParam = location.hash.match(/panel=([a-z0-9_.]+)/); // screenshots: #panel=climate.bedroom
  if (panelParam) setTimeout(function () { openPanel(panelParam[1]); }, 50);
}

// ---------- lifecycle ----------

function onIcueDataUpdated() {
  if (!app.started) return;
  try {
    applyAppearance();
    if (app.demo && String(prop('haToken', '')).trim()) app.demo = false; // user just configured it
    applyConnection();
    renderAll();
  } catch (e) { console.error('Homedeck options', e); }
}

function onIcueInitialized() {
  if (typeof iCUE !== 'undefined' && iCUE.iCUELanguage) HomedeckI18n.setLanguage(iCUE.iCUELanguage);
  start(false);
}

function start(browserOnly) {
  if (app.started) { onIcueDataUpdated(); return; }
  app.started = true;
  var langParam = location.hash.match(/lang=([a-z]{2})/);
  if (langParam) HomedeckI18n.setLanguage(langParam[1]);

  // Browser tests: #url=http://ha:8123&token=...&entities=light.a,sensor.b (hash never leaves the PC)
  if (browserOnly) {
    var h = new URLSearchParams(location.hash.slice(1));
    if (h.get('url')) window.haUrl = h.get('url');
    if (h.get('token')) window.haToken = h.get('token');
    if (h.get('entities')) window.haEntities = h.get('entities');
  }
  var preview = typeof iCUE !== 'undefined' && iCUE.isPreview === true;
  var configured = String(prop('haToken', '')).trim() && String(prop('haEntities', '')).trim();
  new ResizeObserver(function () { layoutGrid(); }).observe($('root'));
  applyAppearance();
  if (!configured && (browserOnly || preview) && !/setup/.test(location.hash)) startDemo();
  applyConnection();
  renderAll();
  setInterval(function () { app.ids.forEach(renderTile); }, 30000); // keeps "5 min ago" fresh
}

// ---------- boot ----------

// A single false read of iCUE_initialized is a race, not proof of a plain browser: retry ~1.5 s.
var bootAttempts = 0, BOOT_RETRY_MS = 100, BOOT_RETRY_MAX = 15;
function bootCheck() {
  if (typeof iCUE_initialized !== 'undefined' && iCUE_initialized) { onIcueInitialized(); return; }
  if (bootAttempts < BOOT_RETRY_MAX) { bootAttempts++; setTimeout(bootCheck, BOOT_RETRY_MS); return; }
  start(true); // plain browser (development)
}
bootCheck();
