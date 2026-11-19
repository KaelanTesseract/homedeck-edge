// Control panel opened by a long press on a tile (or a tap on tiles without a toggle):
// dim lights, set color temperature, set heating targets and modes, cover position,
// fan speed, media volume, input_number values. Every change is one HA service call.
var HomedeckControls = (function () {
  'use strict';

  var t = HomedeckI18n.t;
  var E = HomedeckEntities;
  var HOLD_MS = 2500;   // ignore server echoes this long after the user changed a value
  var IDLE_MS = 20000;  // panel closes itself when left alone

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function roundStep(v, step, min) { return Math.round((v - min) / step) * step + min; }
  function decimals(step) { var s = String(step); return s.indexOf('.') < 0 ? 0 : s.length - s.indexOf('.') - 1; }
  function fmt(v, step) { return E.formatNumber(v, { display_precision: decimals(step) }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
  function features(st) { return num(st.attributes && st.attributes.supported_features, 0); }

  /** Which panel an entity gets, or null. */
  function panelFor(id, st) {
    if (!st || st.state === 'unavailable' || st.state === 'unknown') return null;
    var a = st.attributes || {};
    switch (E.domainOf(id)) {
      case 'light': return 'light';
      case 'climate': return 'climate';
      case 'water_heater': return 'climate';
      case 'cover': return 'cover';
      case 'fan': return (features(st) & 1) || typeof a.percentage === 'number' || Array.isArray(a.preset_modes) ? 'fan' : null;
      case 'media_player': return 'media';
      case 'input_number': case 'number': return 'number';
      default: return null;
    }
  }

  // ---------- building blocks ----------

  /** Horizontal touch slider. opts: label, min, max, step, value, format(v), onCommit(v), track (css bg) */
  function Slider(opts) {
    var self = this;
    this.o = opts;
    this.busy = false;
    this.holdUntil = 0;
    this.el = el('div', 'ctl ctl-slider');
    var head = el('div', 'ctl-head');
    head.appendChild(el('span', 'ctl-label')).textContent = opts.label;
    this.out = head.appendChild(el('span', 'ctl-value'));
    this.el.appendChild(head);
    this.track = el('div', 'ctl-track');
    if (opts.track) { this.track.style.background = opts.track; this.track.classList.add('is-gradient'); }
    this.fill = this.track.appendChild(el('div', 'ctl-fill'));
    this.thumb = this.track.appendChild(el('div', 'ctl-thumb'));
    this.el.appendChild(this.track);

    function fromEvent(ev) {
      var r = self.track.getBoundingClientRect();
      var f = clamp((ev.clientX - r.left) / r.width, 0, 1);
      var o = self.o;
      return clamp(roundStep(o.min + f * (o.max - o.min), o.step, o.min), o.min, o.max);
    }
    this.track.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      self.busy = true;
      try { self.track.setPointerCapture(ev.pointerId); } catch (e) {}
      self.show(fromEvent(ev));
      opts.onActivity && opts.onActivity();
    });
    this.track.addEventListener('pointermove', function (ev) {
      if (!self.busy) return;
      self.show(fromEvent(ev));
    });
    var end = function (ev) {
      if (!self.busy) return;
      self.busy = false;
      var v = fromEvent(ev);
      self.show(v);
      self.holdUntil = Date.now() + HOLD_MS;
      opts.onCommit(v);
    };
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', function () { self.busy = false; });
    this.show(opts.value);
  }
  Slider.prototype.show = function (v) {
    var o = this.o;
    this.value = v;
    var f = o.max > o.min ? (v - o.min) / (o.max - o.min) : 0;
    this.track.style.setProperty('--f', String(clamp(f, 0, 1)));
    this.out.textContent = o.format ? o.format(v) : fmt(v, o.step);
  };
  Slider.prototype.set = function (v) {
    if (this.busy || Date.now() < this.holdUntil || v == null) return;
    this.show(v);
  };

  /** − value + ; several taps are sent as one call. opts: label, min, max, step, value, unit, onCommit */
  function Stepper(opts) {
    var self = this;
    this.o = opts;
    this.holdUntil = 0;
    this.timer = null;
    this.el = el('div', 'ctl ctl-stepper');
    this.el.appendChild(el('span', 'ctl-label')).textContent = opts.label;
    var row = this.el.appendChild(el('div', 'ctl-step-row'));
    var minus = row.appendChild(el('button', 'ctl-btn', HomedeckIcons.svg('minus')));
    this.out = row.appendChild(el('span', 'ctl-step-value'));
    var plus = row.appendChild(el('button', 'ctl-btn', HomedeckIcons.svg('plus')));
    minus.type = plus.type = 'button';
    minus.setAttribute('aria-label', '-'); plus.setAttribute('aria-label', '+');
    var bump = function (dir) {
      var o = self.o;
      self.show(clamp(roundStep(self.value + dir * o.step, o.step, o.min), o.min, o.max));
      self.holdUntil = Date.now() + HOLD_MS + 800;
      opts.onActivity && opts.onActivity();
      clearTimeout(self.timer);
      self.timer = setTimeout(function () { self.holdUntil = Date.now() + HOLD_MS; opts.onCommit(self.value); }, 800);
    };
    minus.addEventListener('click', function () { bump(-1); });
    plus.addEventListener('click', function () { bump(1); });
    this.show(opts.value);
  }
  Stepper.prototype.show = function (v) {
    this.value = v;
    this.out.textContent = fmt(v, this.o.step) + (this.o.unit || '');
  };
  Stepper.prototype.set = function (v) {
    if (Date.now() < this.holdUntil || v == null) return;
    this.show(v);
  };

  /** Row of choice chips. opts: label, options [{key,label}], value, onCommit */
  function Chips(opts) {
    var self = this;
    this.o = opts;
    this.holdUntil = 0;
    this.el = el('div', 'ctl ctl-chips');
    if (opts.label) this.el.appendChild(el('span', 'ctl-label')).textContent = opts.label;
    var row = this.el.appendChild(el('div', 'ctl-chip-row'));
    this.buttons = {};
    opts.options.forEach(function (op) {
      var b = row.appendChild(el('button', 'ctl-chip'));
      b.type = 'button';
      b.textContent = op.label;
      b.addEventListener('click', function () {
        self.show(op.key);
        self.holdUntil = Date.now() + HOLD_MS;
        opts.onActivity && opts.onActivity();
        opts.onCommit(op.key);
      });
      self.buttons[op.key] = b;
    });
    this.show(opts.value);
  }
  Chips.prototype.show = function (key) {
    var b = this.buttons;
    Object.keys(b).forEach(function (k) { b[k].classList.toggle('is-active', k === String(key)); });
  };
  Chips.prototype.set = function (key) { if (Date.now() >= this.holdUntil) this.show(key); };

  /** Icon buttons. items: [{icon, label, onClick}] */
  function Buttons(items, onActivity) {
    this.el = el('div', 'ctl ctl-buttons');
    var self = this;
    items.forEach(function (it) {
      var b = self.el.appendChild(el('button', 'ctl-btn ctl-btn-wide', HomedeckIcons.svg(it.icon)));
      b.type = 'button';
      b.setAttribute('aria-label', it.label);
      b.appendChild(el('span')).textContent = it.label;
      b.addEventListener('click', function () { onActivity && onActivity(); it.onClick(); });
    });
  }
  Buttons.prototype.set = function () {};

  // ---------- panel ----------

  /**
   * @param {HTMLElement} root  panel container (#panel)
   * @param {function(domain, service, data, entityId)} call  sends a service call
   */
  function Panel(root, call) {
    var self = this;
    this.root = root;
    this.call = call;
    this.id = null;
    this.parts = {};
    this.idle = null;
    root.innerHTML =
      '<div class="panel-card" role="dialog">' +
      '<div class="panel-head"><span class="tile-icon panel-icon"></span>' +
      '<span class="panel-title"><span class="panel-name"></span><span class="panel-state"></span></span>' +
      '<button type="button" class="ctl-btn panel-power">' + HomedeckIcons.svg('power') + '</button>' +
      '<button type="button" class="ctl-btn panel-close">' + HomedeckIcons.svg('close') + '</button></div>' +
      '<div class="panel-body"></div></div>';
    this.card = root.querySelector('.panel-card');
    this.body = root.querySelector('.panel-body');
    root.querySelector('.panel-close').setAttribute('aria-label', t('closePanel'));
    root.querySelector('.panel-close').addEventListener('click', function () { self.close(); });
    this.powerBtn = root.querySelector('.panel-power');
    this.powerBtn.setAttribute('aria-label', t('power'));
    this.powerBtn.addEventListener('click', function () {
      self.touch();
      if (self.id) self.call(E.domainOf(self.id), 'toggle', null, self.id);
    });
    root.addEventListener('pointerdown', function (ev) { if (ev.target === root) self.close(); });
  }

  Panel.prototype.isOpen = function () { return !!this.id; };

  Panel.prototype.touch = function () {
    var self = this;
    clearTimeout(this.idle);
    this.idle = setTimeout(function () { self.close(); }, IDLE_MS);
  };

  Panel.prototype.close = function () {
    clearTimeout(this.idle);
    this.id = null;
    this.parts = {};
    this.root.hidden = true;
    this.body.textContent = '';
  };

  Panel.prototype.open = function (id, st) {
    var type = panelFor(id, st);
    if (!type) return false;
    this.id = id;
    this.type = type;
    this.parts = {};
    this.body.textContent = '';
    this.build(type, id, st);
    this.root.hidden = false;
    this.root.dataset.type = type;
    this.update(st);
    this.touch();
    return true;
  };

  Panel.prototype.svc = function (service, data) {
    this.call(E.domainOf(this.id), service, data, this.id);
  };

  Panel.prototype.add = function (key, part) {
    this.parts[key] = part;
    this.body.appendChild(part.el);
  };

  Panel.prototype.build = function (type, id, st) {
    var self = this, a = st.attributes || {}, act = function () { self.touch(); };
    var domain = E.domainOf(id);
    this.powerBtn.hidden = !(domain === 'light' || domain === 'fan' || (domain === 'media_player' && (features(st) & 384)));

    if (type === 'light') {
      var modes = a.supported_color_modes || [];
      var dimmable = modes.length ? modes.some(function (m) { return m !== 'onoff'; }) : typeof a.brightness === 'number';
      if (dimmable) {
        this.add('brightness', new Slider({ label: t('brightness'), min: 1, max: 100, step: 1, value: 0,
          format: function (v) { return v + ' %'; }, onActivity: act,
          onCommit: function (v) { self.svc('turn_on', { brightness_pct: v }); } }));
      }
      if (modes.indexOf('color_temp') >= 0) {
        var kmin = num(a.min_color_temp_kelvin, 2000), kmax = num(a.max_color_temp_kelvin, 6500);
        this.add('kelvin', new Slider({ label: t('colorTemp'), min: kmin, max: kmax, step: 50, value: kmin,
          track: 'linear-gradient(90deg, #ffa34d, #fff1dc, #cfe2ff)',
          format: function (v) { return v + ' K'; }, onActivity: act,
          onCommit: function (v) { self.svc('turn_on', { color_temp_kelvin: v }); } }));
      }
    }

    if (type === 'climate') {
      var step = num(a.target_temp_step, /F/.test(a.temperature_unit || '') ? 1 : 0.5);
      var tmin = num(a.min_temp, 7), tmax = num(a.max_temp, 35);
      var dual = a.temperature == null && a.target_temp_low != null && a.target_temp_high != null;
      if (dual) {
        this.add('low', new Stepper({ label: t('low'), min: tmin, max: tmax, step: step, value: num(a.target_temp_low, tmin), unit: '°', onActivity: act,
          onCommit: function (v) { self.svc('set_temperature', { target_temp_low: v, target_temp_high: self.parts.high.value }); } }));
        this.add('high', new Stepper({ label: t('high'), min: tmin, max: tmax, step: step, value: num(a.target_temp_high, tmax), unit: '°', onActivity: act,
          onCommit: function (v) { self.svc('set_temperature', { target_temp_low: self.parts.low.value, target_temp_high: v }); } }));
      } else if (a.temperature != null || domain === 'climate') {
        this.add('target', new Stepper({ label: t('target'), min: tmin, max: tmax, step: step, value: num(a.temperature, 20), unit: '°', onActivity: act,
          onCommit: function (v) { self.svc('set_temperature', { temperature: v }); } }));
      }
      var modeList = domain === 'climate' ? a.hvac_modes : a.operation_list;
      if (Array.isArray(modeList) && modeList.length > 1) {
        this.add('mode', new Chips({ label: t('mode'), value: st.state, onActivity: act,
          options: modeList.map(function (m) { return { key: m, label: E.prettyState(m) }; }),
          onCommit: function (m) {
            if (domain === 'climate') self.svc('set_hvac_mode', { hvac_mode: m });
            else self.svc('set_operation_mode', { operation_mode: m });
          } }));
      }
      if (domain === 'climate' && Array.isArray(a.preset_modes) && a.preset_modes.length) {
        this.add('preset', new Chips({ label: t('preset'), value: a.preset_mode, onActivity: act,
          options: a.preset_modes.map(function (m) { return { key: m, label: E.prettyState(m) }; }),
          onCommit: function (m) { self.svc('set_preset_mode', { preset_mode: m }); } }));
      }
    }

    if (type === 'cover') {
      var f = features(st);
      if (f & 4) {
        this.add('position', new Slider({ label: t('position'), min: 0, max: 100, step: 1, value: 0,
          format: function (v) { return v + ' %'; }, onActivity: act,
          onCommit: function (v) { self.svc('set_cover_position', { position: v }); } }));
      }
      var btns = [];
      if (!f || f & 1) btns.push({ icon: 'up', label: t('openCover'), onClick: function () { self.svc('open_cover'); } });
      if (!f || f & 8) btns.push({ icon: 'stop', label: t('stopCover'), onClick: function () { self.svc('stop_cover'); } });
      if (!f || f & 2) btns.push({ icon: 'down', label: t('closeCover'), onClick: function () { self.svc('close_cover'); } });
      if (btns.length) this.add('buttons', new Buttons(btns, act));
    }

    if (type === 'fan') {
      if ((features(st) & 1) || typeof a.percentage === 'number') {
        var pstep = num(a.percentage_step, 1);
        this.add('speed', new Slider({ label: t('speed'), min: 0, max: 100, step: pstep, value: 0,
          format: function (v) { return Math.round(v) + ' %'; }, onActivity: act,
          onCommit: function (v) { self.svc('set_percentage', { percentage: Math.round(v) }); } }));
      }
      if (Array.isArray(a.preset_modes) && a.preset_modes.length) {
        this.add('preset', new Chips({ label: t('preset'), value: a.preset_mode, onActivity: act,
          options: a.preset_modes.map(function (m) { return { key: m, label: E.prettyState(m) }; }),
          onCommit: function (m) { self.svc('set_preset_mode', { preset_mode: m }); } }));
      }
    }

    if (type === 'media') {
      var mf = features(st);
      if (!mf || mf & 4) {
        this.add('volume', new Slider({ label: t('volume'), min: 0, max: 100, step: 1, value: 0,
          format: function (v) { return v + ' %'; }, onActivity: act,
          onCommit: function (v) { self.svc('volume_set', { volume_level: v / 100 }); } }));
      }
      var mb = [];
      if (!mf || mf & 16) mb.push({ icon: 'prev', label: t('prevTrack'), onClick: function () { self.svc('media_previous_track'); } });
      mb.push({ icon: 'playpause', label: t('playPause'), onClick: function () { self.svc('media_play_pause'); } });
      if (!mf || mf & 32) mb.push({ icon: 'next', label: t('nextTrack'), onClick: function () { self.svc('media_next_track'); } });
      this.add('buttons', new Buttons(mb, act));
    }

    if (type === 'number') {
      var nmin = num(a.min, 0), nmax = num(a.max, 100), nstep = num(a.step, 1);
      var unit = a.unit_of_measurement ? ' ' + a.unit_of_measurement : '';
      var useStepper = a.mode === 'box' || (nmax - nmin) / nstep > 400;
      var cfg = { label: t('value'), min: nmin, max: nmax, step: nstep, value: num(st.state, nmin), unit: unit, onActivity: act,
        format: function (v) { return fmt(v, nstep) + unit; },
        onCommit: function (v) { self.svc('set_value', { value: v }); } };
      this.add('value', useStepper ? new Stepper(cfg) : new Slider(cfg));
    }
  };

  /** New state from HA (or demo): refresh head and controls the user is not touching. */
  Panel.prototype.update = function (st) {
    if (!this.id) return;
    if (!st || !panelFor(this.id, st)) { this.close(); return; }
    var d = E.describe(this.id, st);
    var a = st.attributes || {};
    var p = this.parts;
    this.root.querySelector('.panel-icon').innerHTML = HomedeckIcons.svg(d.icon);
    this.root.querySelector('.panel-name').textContent = d.name;
    this.root.querySelector('.panel-state').textContent = (d.value || '') + (d.unit ? (d.unit.charAt(0) === '°' ? '' : ' ') + d.unit : '') + (d.sub ? ' · ' + d.sub : '');
    this.card.classList.toggle('is-on', !!d.active);
    this.card.style.setProperty('--tint', d.tint || 'var(--accent-color)');
    this.powerBtn.classList.toggle('is-active', !!d.active);
    var on = st.state === 'on';
    if (p.brightness) p.brightness.set(on && typeof a.brightness === 'number' ? Math.max(1, Math.round(a.brightness / 2.55)) : (on ? 100 : 1));
    if (p.kelvin && typeof a.color_temp_kelvin === 'number') p.kelvin.set(a.color_temp_kelvin);
    if (p.target && a.temperature != null) p.target.set(num(a.temperature, null));
    if (p.low && a.target_temp_low != null) p.low.set(num(a.target_temp_low, null));
    if (p.high && a.target_temp_high != null) p.high.set(num(a.target_temp_high, null));
    if (p.mode) p.mode.set(E.domainOf(this.id) === 'climate' ? st.state : a.operation_mode);
    if (p.preset) p.preset.set(a.preset_mode);
    if (p.position) p.position.set(typeof a.current_position === 'number' ? a.current_position : (st.state === 'open' ? 100 : 0));
    if (p.speed) p.speed.set(on && typeof a.percentage === 'number' ? a.percentage : 0);
    if (p.volume && typeof a.volume_level === 'number') p.volume.set(Math.round(a.volume_level * 100));
    if (p.value) p.value.set(num(st.state, null));
  };

  return { Panel: Panel, panelFor: panelFor };
})();
