// Turns a Home Assistant state object into what a tile shows: icon, name, value, unit,
// "active" (lit) flag, a secondary line, and which service a tap calls.
var HomedeckEntities = (function () {
  'use strict';

  var t = HomedeckI18n.t;

  /** "light.kitchen, sensor.power ,light.kitchen" -> ['light.kitchen', 'sensor.power'] (order kept, no dupes). */
  function parseList(text) {
    var seen = {}, out = [];
    String(text || '').split(/[,;\n]+/).forEach(function (part) {
      var id = part.trim().toLowerCase();
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    return out.slice(0, 48);
  }

  function isValidId(id) { return /^[a-z0-9_]+\.[a-z0-9_]+$/.test(id); }
  function domainOf(id) { return String(id).split('.')[0]; }

  var ON_STATES = { on: 1, open: 1, opening: 1, unlocked: 1, playing: 1, home: 1, heat: 1, cool: 1,
    heat_cool: 1, auto: 1, dry: 1, fan_only: 1, cleaning: 1, active: 1 };

  var BINARY_LABELS = {
    door: ['open', 'closed'], garage_door: ['open', 'closed'], opening: ['open', 'closed'], window: ['open', 'closed'],
    motion: ['detected', 'clear'], occupancy: ['detected', 'clear'], presence: ['home', 'away'], moisture: ['wet', 'dry'],
    problem: ['problem', 'ok'], battery: ['low', 'normal'], battery_charging: ['charging', 'notCharging'],
    connectivity: ['connected', 'disconnected'], lock: ['unlocked', 'locked'], plug: ['on', 'off'], power: ['on', 'off']
  };

  var SENSOR_ICONS = {
    temperature: 'thermo', humidity: 'drop', moisture: 'drop', power: 'bolt', energy: 'bolt', current: 'bolt',
    voltage: 'bolt', apparent_power: 'bolt', power_factor: 'bolt', battery: 'battery', illuminance: 'light_lux',
    carbon_dioxide: 'co2', pm25: 'co2', pm10: 'co2', volatile_organic_compounds: 'co2', pressure: 'gauge',
    atmospheric_pressure: 'gauge', gas: 'gauge', water: 'drop', precipitation: 'drop'
  };

  /** Icon color per kind of reading, so a row of sensors is readable at a glance. */
  var HUES = {
    temperature: '#8fd3ff', humidity: '#7fb6ff', moisture: '#7fb6ff', water: '#7fb6ff', precipitation: '#7fb6ff',
    power: '#ffd36b', energy: '#ffd36b', current: '#ffd36b', voltage: '#ffd36b', apparent_power: '#ffd36b',
    battery: '#8fe3a1', illuminance: '#ffe9a3', carbon_dioxide: '#c9b3ff', pm25: '#c9b3ff', pm10: '#c9b3ff',
    volatile_organic_compounds: '#c9b3ff', pressure: '#a9c4d6', atmospheric_pressure: '#a9c4d6', gas: '#ffb38a'
  };
  var HEAT = '#ff6b3d', COOL = '#4fb4ff';

  function iconFor(domain, dc, isOn, state) {
    switch (domain) {
      case 'light': return 'bulb';
      case 'switch': return dc === 'outlet' ? 'plug' : 'toggle';
      case 'input_boolean': return 'toggle';
      case 'fan': return 'fan';
      case 'lock': return state === 'locked' ? 'lock' : 'unlock';
      case 'cover': return dc === 'garage' || dc === 'door' ? 'door' : 'blind';
      case 'climate': case 'water_heater': return 'climate';
      case 'media_player': return 'media';
      case 'person': case 'device_tracker': return 'person';
      case 'scene': return 'scene';
      case 'script': case 'automation': return 'script';
      case 'button': case 'input_button': return 'button';
      case 'weather': return /sun|clear/.test(state) ? 'sun' : 'cloud';
      case 'sun': return 'sun';
      case 'vacuum': return 'vacuum';
      case 'number': case 'input_number': case 'counter': return 'number';
      case 'zone': return 'home';
      case 'binary_sensor':
        if (dc === 'door' || dc === 'garage_door' || dc === 'opening') return 'door';
        if (dc === 'window') return 'window';
        if (dc === 'motion' || dc === 'occupancy' || dc === 'presence') return 'motion';
        if (dc === 'moisture') return 'drop';
        if (dc === 'lock') return isOn ? 'unlock' : 'lock';
        if (dc === 'battery' || dc === 'battery_charging') return 'battery';
        if (dc === 'plug' || dc === 'power') return 'plug';
        if (dc === 'problem' || dc === 'safety' || dc === 'smoke' || dc === 'gas') return 'alert';
        return 'dot';
      case 'sensor': return SENSOR_ICONS[dc] || 'gauge';
      default: return 'dot';
    }
  }

  /** Rounds a reading the way HA's own UI roughly does: display_precision if given, else by size. */
  function formatNumber(raw, attrs) {
    var n = Number(raw);
    if (!isFinite(n)) return null;
    var p = attrs && attrs.display_precision;
    var digits;
    if (typeof p === 'number' && p >= 0 && p <= 6) digits = p;
    else {
      var a = Math.abs(n);
      digits = a >= 100 || Number.isInteger(n) ? 0 : a >= 10 ? 1 : 2;
      if (Number.isInteger(n)) digits = 0;
    }
    try {
      return n.toLocaleString(HomedeckI18n.lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch (e) { return n.toFixed(digits); }
  }

  function prettyState(s) {
    var key = s === 'dry' ? 'dry_mode' : s;
    var label = t(key);
    if (label !== key) return label;
    return String(s).replace(/_/g, ' ').replace(/^\w/, function (c) { return c.toUpperCase(); });
  }

  function relTime(iso) {
    var ts = Date.parse(iso);
    if (!isFinite(ts)) return '';
    var min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return t('justNow');
    var fmt = function (key, n) { return t(key).replace('{n}', n); };
    if (min < 60) return fmt('minAgo', min);
    if (min < 60 * 24) return fmt('hAgo', Math.round(min / 60));
    return fmt('dAgo', Math.round(min / 1440));
  }

  /** Service a tap calls, or null when the entity cannot be switched. */
  function actionFor(domain, state) {
    switch (domain) {
      case 'light': case 'switch': case 'input_boolean': case 'fan': case 'automation': case 'cover':
        return { domain: domain, service: 'toggle' };
      case 'media_player': return { domain: domain, service: 'media_play_pause' };
      case 'lock': return { domain: domain, service: state === 'locked' ? 'unlock' : 'lock' };
      case 'scene': case 'script': return { domain: domain, service: 'turn_on' };
      case 'button': case 'input_button': return { domain: domain, service: 'press' };
      default: return null;
    }
  }

  /**
   * @param {string} id entity id
   * @param {object|null|undefined} st HA state ({state, attributes, last_changed}); null = not found,
   *        undefined = not loaded yet
   */
  function describe(id, st) {
    var domain = domainOf(id);
    if (st === undefined) return { id: id, kind: 'loading', icon: iconFor(domain, '', false, ''), name: id, value: '', unit: '' };
    if (st === null || !isValidId(id)) {
      return { id: id, kind: 'missing', icon: 'alert', name: id, value: t('notFound'), unit: '' };
    }
    var a = st.attributes || {};
    var s = String(st.state);
    var dc = a.device_class || '';
    var name = a.friendly_name || id.split('.')[1].replace(/_/g, ' ');
    var d = { id: id, kind: 'value', name: name, value: '', unit: '', sub: '', active: false, action: null, level: null };

    if (s === 'unavailable' || s === 'unknown') {
      d.kind = 'unavailable';
      d.icon = iconFor(domain, dc, false, s);
      d.value = t(s);
      return d;
    }

    var isOn = !!ON_STATES[s];
    switch (domain) {
      case 'light': case 'switch': case 'input_boolean': case 'fan': case 'automation':
        d.kind = 'toggle';
        d.active = s === 'on';
        d.value = d.active ? t('on') : t('off');
        if (domain === 'light' && d.active && typeof a.brightness === 'number') {
          d.level = Math.round(a.brightness / 2.55);
          d.value = d.level + '';
          d.unit = '%';
        }
        if (domain === 'fan' && d.active && typeof a.percentage === 'number') { d.level = a.percentage; d.value = a.percentage + ''; d.unit = '%'; }
        if (domain === 'light' && d.active && Array.isArray(a.rgb_color)) d.tint = 'rgb(' + a.rgb_color.join(',') + ')';
        break;
      case 'binary_sensor':
        d.kind = 'binary';
        d.active = s === 'on';
        var pair = BINARY_LABELS[dc];
        d.value = pair ? t(d.active ? pair[0] : pair[1]) : (d.active ? t('on') : t('off'));
        d.sub = relTime(st.last_changed);
        break;
      case 'cover':
        d.kind = 'toggle';
        d.active = s === 'open' || s === 'opening';
        if (typeof a.current_position === 'number' && s !== 'closed') { d.value = a.current_position + ''; d.unit = '%'; d.level = a.current_position; d.sub = prettyState(s); }
        else d.value = prettyState(s);
        break;
      case 'lock':
        d.kind = 'toggle';
        d.active = s !== 'locked';
        d.value = prettyState(s);
        break;
      case 'climate': case 'water_heater':
        d.kind = 'value';
        var hvac = a.hvac_action;
        d.active = hvac ? (hvac === 'heating' || hvac === 'cooling' || hvac === 'drying' || hvac === 'fan')
          : s !== 'off';
        d.tint = hvac === 'cooling' || (!hvac && s === 'cool') ? COOL : HEAT;
        d.hue = d.tint;
        if (typeof a.current_temperature === 'number') {
          d.value = formatNumber(a.current_temperature, { display_precision: 1 });
          d.unit = '°';
          d.sub = prettyState(s) + (typeof a.temperature === 'number' && s !== 'off'
            ? ' → ' + formatNumber(a.temperature, { display_precision: a.temperature % 1 ? 1 : 0 }) + '°' : '');
        } else d.value = prettyState(s);
        break;
      case 'media_player':
        d.kind = 'toggle';
        d.active = s === 'playing';
        d.value = prettyState(s);
        d.sub = [a.media_artist, a.media_title].filter(Boolean).join(' · ');
        break;
      case 'scene': case 'script': case 'button': case 'input_button':
        d.kind = 'action';
        d.active = domain === 'script' && s === 'on';
        d.value = domain === 'scene' ? t('activate') : domain === 'script' ? (d.active ? prettyState('on') : t('run')) : t('press');
        if (domain !== 'script') d.sub = relTime(s);
        break;
      case 'weather':
        d.kind = 'value';
        d.value = typeof a.temperature === 'number' ? formatNumber(a.temperature, { display_precision: 0 }) : prettyState(s);
        d.unit = typeof a.temperature === 'number' ? (a.temperature_unit || '°') : '';
        d.sub = prettyState(s);
        break;
      case 'person': case 'device_tracker':
        d.kind = 'binary';
        d.active = s === 'home';
        d.value = prettyState(s);
        break;
      default: {
        var num = formatNumber(s, a);
        if (num !== null) {
          d.value = num;
          d.unit = a.unit_of_measurement || '';
          if (dc === 'battery' || (d.unit === '%' && dc === '')) d.level = Math.max(0, Math.min(100, Number(s)));
        } else if (dc === 'timestamp') {
          d.value = relTime(s);
        } else {
          d.value = prettyState(s);
          d.active = isOn;
        }
      }
    }
    d.icon = iconFor(domain, dc, isOn, s);
    d.action = actionFor(domain, s);
    // Thermostats: flame while heating, snowflake while cooling, thermometer otherwise.
    if (domain === 'climate' || domain === 'water_heater') d.icon = d.active ? (d.tint === COOL ? 'climate' : 'flame') : 'thermo';
    if (!d.hue && (domain === 'sensor' || domain === 'weather')) d.hue = HUES[dc] || (domain === 'weather' ? '#ffd36b' : null);
    return d;
  }

  return { parseList: parseList, describe: describe, isValidId: isValidId, domainOf: domainOf,
    formatNumber: formatNumber, prettyState: prettyState };
})();
