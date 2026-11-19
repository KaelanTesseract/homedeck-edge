// Minimal Home Assistant WebSocket client: auth, initial states, live updates via
// subscribe_entities (only the chosen entities), service calls, reconnect with backoff.
// WebSocket needs no CORS entry on the HA server.
var HomedeckClient = (function () {
  'use strict';

  /** "192.168.1.20:8123" / "http://ha.local:8123/" -> "ws://192.168.1.20:8123/api/websocket", or null. */
  function toWsUrl(address) {
    var raw = String(address || '').trim();
    if (!raw) return null;
    if (!/^[a-z]+:\/\//i.test(raw)) raw = 'http://' + raw;
    var u;
    try { u = new URL(raw); } catch (e) { return null; }
    var proto = u.protocol === 'https:' || u.protocol === 'wss:' ? 'wss:' : u.protocol === 'http:' || u.protocol === 'ws:' ? 'ws:' : null;
    if (!proto || !u.hostname) return null;
    var path = u.pathname.replace(/\/+$/, '').replace(/\/api\/websocket$/, '');
    return proto + '//' + u.host + path + '/api/websocket';
  }

  /**
   * @param {object} h handlers: onStatus(status, detail), onStates(map id->state|null, initial), onError(kind)
   */
  function Client(h) {
    this.h = h;
    this.ws = null;
    this.nextId = 1;
    this.pending = {};
    this.backoff = 2000;
    this.timer = null;
    this.config = null;
    this.closedByUs = false;
    this.authFailed = false;
  }

  Client.prototype.configure = function (url, token, ids) {
    var key = url + '|' + token + '|' + ids.join(',');
    if (this.config && this.config.key === key) return;
    this.config = { url: url, token: token, ids: ids, key: key };
    this.authFailed = false;
    this.backoff = 2000;
    this.connect();
  };

  Client.prototype.stop = function () {
    this.config = null;
    this.teardown();
  };

  Client.prototype.teardown = function () {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.ws) {
      this.closedByUs = true;
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this.pending = {};
  };

  Client.prototype.connect = function () {
    this.teardown();
    var c = this.config;
    if (!c) return;
    var self = this;
    var ws;
    this.closedByUs = false;
    this.h.onStatus('connecting');
    try { ws = new WebSocket(c.url); } catch (e) {
      // blocked (permission denied / revoked) or malformed: retry later
      this.h.onError('unreachable');
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    var opened = false;
    var watchdog = setTimeout(function () { if (!opened) { try { ws.close(); } catch (e) {} } }, 10000);

    ws.onopen = function () { opened = true; clearTimeout(watchdog); };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (Array.isArray(msg)) msg.forEach(function (m) { self.handle(m); });
      else self.handle(msg);
    };
    ws.onerror = function () { /* onclose follows */ };
    ws.onclose = function () {
      clearTimeout(watchdog);
      if (self.ws !== ws) return;
      self.ws = null;
      self.pending = {};
      if (self.closedByUs || !self.config) return;
      if (self.authFailed) return; // a wrong token will not get better by retrying
      self.h.onError(opened ? 'lost' : 'unreachable');
      self.scheduleReconnect();
    };
  };

  Client.prototype.scheduleReconnect = function () {
    var self = this;
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.connect(); }, this.backoff);
    this.backoff = Math.min(30000, Math.round(this.backoff * 1.7));
  };

  Client.prototype.send = function (payload, cb) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    payload.id = this.nextId++;
    if (cb) this.pending[payload.id] = cb;
    this.ws.send(JSON.stringify(payload));
    return true;
  };

  Client.prototype.handle = function (msg) {
    var self = this, c = this.config;
    if (!c) return;
    switch (msg.type) {
      case 'auth_required':
        this.ws.send(JSON.stringify({ type: 'auth', access_token: c.token }));
        return;
      case 'auth_invalid':
        this.authFailed = true;
        this.h.onError('auth');
        return;
      case 'auth_ok':
        this.backoff = 2000;
        this.start();
        return;
      case 'result': {
        var cb = this.pending[msg.id];
        delete this.pending[msg.id];
        if (cb) cb(msg);
        return;
      }
      case 'event': {
        var cbE = this.pending['sub' + msg.id];
        if (cbE) cbE(msg.event);
        return;
      }
    }
  };

  /** After auth: one get_states to learn which ids exist, then a filtered live subscription. */
  Client.prototype.start = function () {
    var self = this, c = this.config;
    this.send({ type: 'get_states' }, function (res) {
      if (!res.success || !Array.isArray(res.result)) { self.h.onError('lost'); return; }
      var found = {};
      res.result.forEach(function (st) { found[st.entity_id] = st; });
      var map = {};
      c.ids.forEach(function (id) { map[id] = found[id] || null; });
      self.states = map;
      self.h.onStates(map, true);
      self.h.onStatus('live');
      self.subscribe();
    });
  };

  Client.prototype.subscribe = function () {
    var self = this, c = this.config;
    var existing = c.ids.filter(function (id) { return self.states[id]; });
    if (!existing.length) return;
    var id = this.nextId;
    var ok = this.send({ type: 'subscribe_entities', entity_ids: existing }, function (res) {
      if (!res.success) self.subscribeLegacy();
    });
    if (ok) this.pending['sub' + id] = function (ev) { self.applyCompressed(ev); };
  };

  /** Older HA without subscribe_entities: all state_changed events, filtered here. */
  Client.prototype.subscribeLegacy = function () {
    var self = this;
    var id = this.nextId;
    if (this.send({ type: 'subscribe_events', event_type: 'state_changed' })) {
      this.pending['sub' + id] = function (ev) {
        var d = ev && ev.data;
        if (!d || !(d.entity_id in self.states)) return;
        self.states[d.entity_id] = d.new_state || null;
        self.h.onStates(self.states, false);
      };
    }
  };

  function fromCompressed(e) {
    return {
      state: e.s,
      attributes: e.a || {},
      last_changed: typeof e.lc === 'number' ? new Date(e.lc * 1000).toISOString() : undefined,
      last_updated: typeof e.lu === 'number' ? new Date(e.lu * 1000).toISOString() : undefined
    };
  }

  /** subscribe_entities events: a = added/full, c = changed (+ diff / - removed attrs), r = removed. */
  Client.prototype.applyCompressed = function (ev) {
    if (!ev) return;
    var s = this.states, changed = false;
    if (ev.a) Object.keys(ev.a).forEach(function (id) { s[id] = fromCompressed(ev.a[id]); changed = true; });
    if (ev.c) Object.keys(ev.c).forEach(function (id) {
      var cur = s[id];
      if (!cur) return;
      var diff = ev.c[id];
      var next = { state: cur.state, attributes: Object.assign({}, cur.attributes), last_changed: cur.last_changed };
      if (diff['+']) {
        var p = diff['+'];
        if ('s' in p) next.state = p.s;
        if (p.a) Object.assign(next.attributes, p.a);
        if (typeof p.lc === 'number') next.last_changed = new Date(p.lc * 1000).toISOString();
        else if ('s' in p && typeof p.lu === 'number') next.last_changed = new Date(p.lu * 1000).toISOString();
      }
      if (diff['-'] && Array.isArray(diff['-'].a)) diff['-'].a.forEach(function (k) { delete next.attributes[k]; });
      s[id] = next;
      changed = true;
    });
    if (Array.isArray(ev.r)) ev.r.forEach(function (id) { s[id] = null; changed = true; });
    if (changed) this.h.onStates(s, false);
  };

  Client.prototype.callService = function (action, entityId, cb) {
    var msg = {
      type: 'call_service', domain: action.domain, service: action.service,
      target: { entity_id: entityId }
    };
    if (action.data) msg.service_data = action.data;
    return this.send(msg, cb);
  };

  return { Client: Client, toWsUrl: toWsUrl };
})();
