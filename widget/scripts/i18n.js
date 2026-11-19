// Body texts (tr() only works in iCUE metadata, not in the page itself).
// Language follows iCUE.iCUELanguage, falling back to the browser language.
var HomedeckI18n = (function () {
  'use strict';

  var texts = {
    en: {
      on: 'On', off: 'Off', unavailable: 'Unavailable', unknown: 'Unknown', notFound: 'NOT FOUND',
      open: 'Open', closed: 'Closed', opening: 'Opening', closing: 'Closing',
      locked: 'Locked', unlocked: 'Unlocked', locking: 'Locking', unlocking: 'Unlocking', jammed: 'Jammed',
      detected: 'Detected', clear: 'Clear', wet: 'Wet', dry: 'Dry', home: 'Home', away: 'Away',
      playing: 'Playing', paused: 'Paused', idle: 'Idle', standby: 'Standby',
      heat: 'Heat', cool: 'Cool', auto: 'Auto', heat_cool: 'Heat/Cool', dry_mode: 'Dry', fan_only: 'Fan',
      problem: 'Problem', ok: 'OK', low: 'Low', normal: 'Normal', charging: 'Charging', notCharging: 'Not charging',
      connected: 'Connected', disconnected: 'Disconnected', run: 'Run', press: 'Press', activate: 'Activate',
      live: 'Live', connecting: 'Connecting', offline: 'Offline, last known data', reconnecting: 'Reconnecting',
      demo: 'Sample data', entities: 'entities', entity: 'entity',
      setupTitle: 'Connect your Home Assistant',
      setupHint: 'In the iCUE settings enter the address, a long-lived token and the entity IDs.',
      noEntitiesTitle: 'No entities chosen',
      noEntitiesHint: 'Enter entity IDs separated by commas, e.g. light.kitchen, sensor.power',
      authTitle: 'Token rejected',
      authHint: 'Create a new long-lived token in Home Assistant under Profile, Security.',
      unreachableTitle: 'Home Assistant not reachable',
      unreachableHint: 'Check the address and that the widget may use the network. Retrying.',
      badUrlTitle: 'Address not valid',
      badUrlHint: 'Example: http://192.168.1.20:8123',
      brightness: 'Brightness', colorTemp: 'Color temperature', target: 'Target', low: 'Min', high: 'Max',
      mode: 'Mode', preset: 'Preset', position: 'Position', volume: 'Volume', speed: 'Speed', value: 'Value',
      openCover: 'Open', stopCover: 'Stop', closeCover: 'Close', closePanel: 'Close', power: 'On/Off',
      prevTrack: 'Previous', nextTrack: 'Next', playPause: 'Play/Pause',
      justNow: 'just now', minAgo: '{n} min ago', hAgo: '{n} h ago', dAgo: '{n} d ago'
    },
    de: {
      on: 'An', off: 'Aus', unavailable: 'Nicht verfügbar', unknown: 'Unbekannt', notFound: 'NICHT GEFUNDEN',
      open: 'Offen', closed: 'Geschlossen', opening: 'Öffnet', closing: 'Schließt',
      locked: 'Verriegelt', unlocked: 'Entriegelt', locking: 'Verriegelt…', unlocking: 'Entriegelt…', jammed: 'Blockiert',
      detected: 'Erkannt', clear: 'Frei', wet: 'Nass', dry: 'Trocken', home: 'Zuhause', away: 'Abwesend',
      playing: 'Spielt', paused: 'Pausiert', idle: 'Inaktiv', standby: 'Standby',
      heat: 'Heizen', cool: 'Kühlen', auto: 'Auto', heat_cool: 'Heizen/Kühlen', dry_mode: 'Entfeuchten', fan_only: 'Lüfter',
      problem: 'Problem', ok: 'OK', low: 'Niedrig', normal: 'Normal', charging: 'Lädt', notCharging: 'Lädt nicht',
      connected: 'Verbunden', disconnected: 'Getrennt', run: 'Ausführen', press: 'Drücken', activate: 'Aktivieren',
      live: 'Live', connecting: 'Verbinde', offline: 'Offline, letzte Daten', reconnecting: 'Verbinde neu',
      demo: 'Beispieldaten', entities: 'Entitäten', entity: 'Entität',
      setupTitle: 'Home Assistant verbinden',
      setupHint: 'Trage in den iCUE-Einstellungen Adresse, ein langlebiges Token und die Entitäts-IDs ein.',
      noEntitiesTitle: 'Keine Entitäten gewählt',
      noEntitiesHint: 'Trage Entitäts-IDs durch Komma getrennt ein, z. B. light.kueche, sensor.strom',
      authTitle: 'Token abgelehnt',
      authHint: 'Erstelle in Home Assistant unter Profil, Sicherheit ein neues langlebiges Token.',
      unreachableTitle: 'Home Assistant nicht erreichbar',
      unreachableHint: 'Prüfe die Adresse und ob das Widget ins Netzwerk darf. Neuer Versuch läuft.',
      badUrlTitle: 'Adresse ungültig',
      badUrlHint: 'Beispiel: http://192.168.1.20:8123',
      brightness: 'Helligkeit', colorTemp: 'Farbtemperatur', target: 'Soll', low: 'Min', high: 'Max',
      mode: 'Modus', preset: 'Voreinstellung', position: 'Position', volume: 'Lautstärke', speed: 'Stufe', value: 'Wert',
      openCover: 'Öffnen', stopCover: 'Stopp', closeCover: 'Schließen', closePanel: 'Schließen', power: 'An/Aus',
      prevTrack: 'Zurück', nextTrack: 'Weiter', playPause: 'Play/Pause',
      justNow: 'gerade eben', minAgo: 'vor {n} Min.', hAgo: 'vor {n} Std.', dAgo: 'vor {n} Tg.'
    }
  };

  var lang = 'en';

  function setLanguage(code) {
    var short = String(code || '').toLowerCase().slice(0, 2);
    lang = texts[short] ? short : 'en';
    document.documentElement.lang = lang;
  }

  function t(key) {
    return (texts[lang] && texts[lang][key]) || texts.en[key] || key;
  }

  setLanguage(typeof navigator !== 'undefined' ? navigator.language : 'en');
  return { setLanguage: setLanguage, t: t, get lang() { return lang; } };
})();
