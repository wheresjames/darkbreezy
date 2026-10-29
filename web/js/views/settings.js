// Settings (#/settings): theme and page width, units, time and air
// quality, the map and rotation, warnings, the radar, wallpaper mode,
// which cards show and in what order, and Advanced (build, refresh app
// files, saved data, error log, reset).
// Changes apply at once.
//
// Every setting is a row: its name and a one-line hint on the left, the
// control on the right (stacked on phones). One kind of control per kind
// of choice: segmented buttons for a few short options, a dropdown for
// long ones, a switch for on/off, chips for picking several.

import { h, icon } from '../core/h.js';
import { t } from '../core/i18n.js';
import { signal } from '../core/signal.js';
import { errorLog, errorReport, clearErrors, markErrorsSeen } from '../core/errors.js';
import { settings, WIDGETS, DEFAULTS, PAGE_WIDTHS, DWELLS, widgetOrder, fromAddress } from '../state/settings.js';
import { favorites, homePlace, lastPlace } from '../state/favorites.js';
import { toParams } from '../util/params.js';
import { placeHash } from '../util/place.js';
import { cacheSize, cachedPlaces, clearCache } from '../state/cache.js';
import { UNITS, SYSTEMS, systemFor } from '../util/units.js';
import { installed, label, refresh } from '../update.js';
import { makeBackup, readBackup, packLink, unpackLink, isLink } from '../util/backup.js';
import { setTitle } from './common.js';
import { importPanel } from './import.js';

const s = () => settings.value;
const set = (patch) => settings.update((x) => ({ ...x, ...patch }));
const setLabels = (patch) => settings.update((x) => ({ ...x, mapLabels: { ...x.mapLabels, ...patch } }));

let ids = 0;
const uid = (name) => `set-${name}-${++ids}`;

/** A group of settings: a panel with a heading. */
const group = (title, ...rows) => h('section.settings-group', h('h2', title), rows);

/**
 * One setting: [name] and [hint] beside [control]. [control] gets the id
 * its label should point at, so the name is the control's accessible name.
 */
function row(name, hint, control, { cls = '', disabled, keys = [] } = {}) {
  const id = uid('row');
  // Set by this page's address (util/params.js): it wins here, so the control is dimmed and off.
  const locked = fromUrl(...keys);
  return h('div.setting', { class: [cls, { 'is-disabled': disabled || locked, 'from-url': locked }] },
    h('div.setting-text',
      h('label.setting-name', { for: id, id: `${id}-label` }, name),
      hint && h('p.setting-hint', hint),
      locked && h('p.setting-hint.from-url-note', t('Set by this page\'s address.'))),
    locked ? h('fieldset.setting-control', { disabled: true }, control(id)) : h('div.setting-control', control(id)));
}

/** Whether any of setting [keys] comes from this page's address. */
const fromUrl = (...keys) => keys.some((k) => settings.overridden.includes(k));

/** Segmented buttons for one of a few short [options]: [[value, label], ...]. */
function segmented(name, options, get, onchange, { disabled } = {}) {
  return (id) => h('div.segmented', { role: 'radiogroup', 'aria-labelledby': `${id}-label`, id },
    options.map(([value, text]) => h('label.segment',
      h('input', { type: 'radio', name, value, checked: () => get() === value, disabled: disabled || false, onchange: () => onchange(value) }),
      h('span', text))));
}

/** A dropdown for [options]: { value: label } or [[value, label], ...]. */
function dropdown(options, get, onchange) {
  const list = Array.isArray(options) ? options : Object.entries(options);
  return (id) => h('select.select', { id, onchange: (e) => onchange(e.target.value) },
    list.map(([value, name]) => h('option', { value, selected: () => get() === value }, name)));
}

/** An on/off switch. */
function toggle(get, onchange, { disabled } = {}) {
  return (id) => h('input.switch', { type: 'checkbox', role: 'switch', id, checked: get, disabled: disabled || false, onchange: (e) => onchange(e.target.checked) });
}

export function settingsView() {
  setTitle(t('Settings'));
  const autoName = { metric: t('metric'), imperial: t('US'), uk: t('UK') }[systemFor(navigator.language)];
  const pageWidths = PAGE_WIDTHS.map(([v]) => [v, v === 'none' ? t('No limit') : `${v} px`]);

  const appearance = group(t('Appearance'),
    row(t('Theme'), null, segmented('theme', [['auto', t('Auto')], ['light', t('Light')], ['dark', t('Dark')], ['contrast', t('High contrast')]],
      () => s().theme, (theme) => set({ theme })), { keys: ['theme'] }),
    row(t('Page width'), t('With no limit, wide screens show more columns: a full screen can show every card.'),
      segmented('max-width', pageWidths, () => s().maxWidth, (maxWidth) => set({ maxWidth })), { keys: ['maxWidth'] }),
    row(t('Layout'), t('Scroll: every card at full size; scroll to see them all. Fit: big tiles for now, the map, radar and forecast, with everything on one screen; the cards lower in your order shrink to one line, then hide. Auto: Fit on screens at least 1800 × 900 px, Scroll on smaller ones.'),
      segmented('layout', [['auto', t('Auto')], ['scroll', t('Scroll')], ['fit', t('Fit')]], () => s().layout, (layout) => set({ layout })), { keys: ['layout'] }));

  const pickSystem = (units) => set({ units, ...(units === 'custom' && s().units !== 'custom' ? { custom: { ...SYSTEMS[s().units === 'auto' ? systemFor(navigator.language) : s().units] || DEFAULTS.custom } } : {}) });
  const unit = (key, name) => row(name, null, dropdown(UNITS[key], () => s().custom[key], (v) => set({ custom: { ...s().custom, [key]: v } })), { cls: 'setting-sub', keys: ['units', 'custom'] });
  const units = group(t('Units'),
    row(t('Measurement system'), null, dropdown([
      ['auto', t('Automatic ({name})', { name: autoName })],
      ['metric', t('Metric (°C, km/h, hPa, mm)')],
      ['imperial', t('US (°F, mph, inHg, in)')],
      ['uk', t('UK (°C, mph, hPa, mm)')],
      ['custom', t('Choose each')],
    ], () => s().units, pickSystem), { keys: ['units'] }),
    () => s().units === 'custom' && [
      unit('temp', t('Temperature')), unit('wind', t('Wind')), unit('pressure', t('Pressure')),
      unit('precip', t('Precipitation')), unit('distance', t('Distance')), unit('height', t('Wave height')),
    ]);

  const timeAir = group(t('Time and air quality'),
    row(t('Clock'), null, segmented('clock', [['auto', t('Auto')], ['12', t('12-hour')], ['24', t('24-hour')]], () => s().clock, (clock) => set({ clock })), { keys: ['clock'] }),
    row(t('Air quality index'), t('Auto uses the European index in Europe and the US index elsewhere.'),
      segmented('aqi', [['auto', t('Auto')], ['us', t('US')], ['eu', t('European')]], () => s().aqi, (aqi) => set({ aqi })), { keys: ['aqi'] }));

  const PARTS = [['city', t('City')], ['temp', t('Temperature')], ['hilo', t('High/low')], ['time', t('Local time')]];
  const map = group(t('Map and rotation'),
    row(t('World map'), t('Your places on a map beside the current conditions.'), toggle(() => s().showMap, (showMap) => set({ showMap })), { cls: 'setting-inline', keys: ['showMap'] }),
    () => {
      const off = !s().showMap;
      const noLabels = off || !s().mapLabels.show;
      return [
        row(t('Map labels'), null, toggle(() => s().mapLabels.show, (show) => setLabels({ show }), { disabled: off }), { cls: 'setting-inline', disabled: off, keys: ['mapLabels'] }),
        row(t('Labels show'), t('Labels shorten, then hide, where places are crowded.'), (id) => h('div.chips', { role: 'group', 'aria-labelledby': `${id}-label`, id },
          PARTS.map(([k, name]) => h('label.chip',
            h('input', { type: 'checkbox', checked: () => s().mapLabels[k], disabled: noLabels, onchange: (e) => setLabels({ [k]: e.target.checked }) }),
            h('span', name)))), { cls: 'setting-sub', disabled: noLabels, keys: ['mapLabels'] }),
      ];
    },
    row(t('Rotate: time on each place'), t('Turn rotation on with the Rotate button on the map. It waits while you\'re using the page.'),
      segmented('dwell', DWELLS.map((n) => [String(n), n < 60 ? t('{n} s', { n }) : t('{n} min', { n: n / 60 })]), () => String(s().dwell), (v) => set({ dwell: Number(v) })), { keys: ['dwell'] }));

  const warnings = group(t('Warnings'),
    row(t('Warnings ticker'), t('One line that goes through the warnings in turn, a sentence or two at a time; click it to read them in full. Auto: in the Fit layout only, the full list of warnings otherwise.'),
      segmented('ticker', [['auto', t('Auto')], ['always', t('Always')], ['never', t('Never')]], () => s().alertTicker, (alertTicker) => set({ alertTicker })), { keys: ['alertTicker'] }),
    row(t('Move to the bottom when there are none'), t('With no warnings in effect, the Warnings card goes after all the others. Off: it stays where it is in your card order. While there are warnings, the card is where you put it (in the Fit layout, across the top).'),
      toggle(() => s().quietLast, (quietLast) => set({ quietLast })), { cls: 'setting-inline', keys: ['quietLast'] }));

  const wallpaper = wallpaperGroup();

  const radar = group(t('Radar'),
    row(t('Play the radar loop'), t('The last 2 hours, every 10 minutes, played on its own. Never when your system asks for less motion.'),
      toggle(() => s().radarAutoplay, (radarAutoplay) => set({ radarAutoplay })), { cls: 'setting-inline', keys: ['radarAutoplay'] }));

  // Settings the address sets for this page (util/params.js) win over what's chosen here.
  const fromUrl = settings.overridden.length > 0 && h('p.settings-notice', { role: 'note' },
    t('Some settings come from this page\'s address ({list}): they apply until you open Dark Breezy without them. Changes here are saved for then.', { list: fromAddress.used.join(', ') }));

  return h('div.sheet.settings-page',
    h('h1', t('Settings')),
    fromUrl,
    appearance,
    units,
    timeAir,
    map,
    warnings,
    radar,
    wallpaper,
    cardsGroup(),
    advanced());
}

/**
 * Wallpaper: "Try it" (the address in a new window), how dark, and the
 * address to give a wallpaper app, built from the settings and favorites in use.
 */
function wallpaperGroup() {
  const address = () => {
    // The place last looked at (what "Try it" should show), else home.
    const place = lastPlace.peek().place || homePlace();
    const query = toParams(s(), favorites.value.list, DEFAULTS, { wallpaper: true });
    return `${location.origin}${location.pathname}?${query}${place ? placeHash(place) : '#/'}`;
  };
  const copied = signal('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(address()); copied.value = t('Copied.'); } catch { copied.value = t('Select the address and copy it.'); }
  };
  return group(t('Wallpaper'),
    row(t('Wallpaper mode'), t('For desktop wallpaper apps: the large-screen layout fitted to the screen, no controls, darkened. It\'s turned on by the address below; try it in a new window (Esc or a double-click there shows a way out).'),
      () => h('button.btn.btn-small', { type: 'button', onclick: () => window.open(address(), 'darkbreezy-wallpaper', 'noopener') }, t('Try it'))),
    row(t('Darkness'), t('How much the wallpaper is darkened.'), (id) => h('div.range-field',
      h('input.range', { type: 'range', id, min: 0, max: 90, step: 5, value: () => String(s().dim),
        'aria-valuetext': () => `${s().dim}%`, oninput: (e) => set({ dim: Number(e.target.value) }) }),
      h('output.range-value', { for: id }, () => `${s().dim}%`)), { keys: ['dim'] }),
    h('div.setting.setting-stack',
      h('div.setting-text',
        h('label.setting-name', { for: 'wallpaper-url' }, t('Address for a wallpaper app')),
        h('p.setting-hint', t('Every setting can be given in the address, for apps that only take a URL. This one has your current settings and places, and the place you looked at last, with wallpaper mode on.'))),
      h('div.url-field',
        h('input.url', { id: 'wallpaper-url', type: 'text', readOnly: true, value: address, onfocus: (e) => e.target.select() }),
        h('button.btn.btn-small', { type: 'button', onclick: copy }, t('Copy'))),
      () => copied.value && h('p.small.muted', copied.value)));
}

/** Which cards show, and their order. */
function cardsGroup() {
  const names = Object.fromEntries(WIDGETS);
  const order = () => widgetOrder(s());
  const move = (id, by) => {
    const list = order();
    const i = list.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set({ order: list });
  };
  const locked = fromUrl('order', 'hidden');
  const list = h('ol.widget-list', () => order().map((id, i, all) => {
      const name = t(names[id]);
      const on = !s().hidden.includes(id);
      return h('li.widget-row', { class: { 'is-off': !on } },
        h('label.widget-name',
          h('input.switch', { type: 'checkbox', role: 'switch', checked: on,
            onchange: (e) => set({ hidden: e.target.checked ? s().hidden.filter((x) => x !== id) : [...s().hidden, id] }) }),
          h('span', name)),
        h('span.widget-move',
          h('button.icon-btn', { type: 'button', disabled: i === 0, 'aria-label': t('Move {name} up', { name }), onclick: () => move(id, -1) }, icon('chevron-up')),
          h('button.icon-btn', { type: 'button', disabled: i === all.length - 1, 'aria-label': t('Move {name} down', { name }), onclick: () => move(id, 1) }, icon('chevron-down'))));
  }));
  return h('section.settings-group', { class: { 'from-url': locked } },
    h('div.group-head',
      h('h2', t('Cards')),
      h('button.btn.btn-small', { type: 'button', disabled: locked, onclick: () => set({ order: DEFAULTS.order, hidden: [] }) }, t('Restore defaults'))),
    h('p.setting-hint.group-hint', t('Switch cards on or off, and move them up or down. Cards with no data for a place (pollen outside Europe, say) hide by themselves.')),
    locked && h('p.setting-hint.group-hint.from-url-note', t('Set by this page\'s address.')),
    // Set by the address: dimmed and off (a disabled fieldset turns off everything in it).
    locked ? h('fieldset.widget-fields', { disabled: true }, list) : list);
}

/**
 * Back up and move (util/backup.js): everything, or the places only, out
 * as a file, a copy or a link; in from a file or a paste (JSON or a link),
 * confirmed before anything's saved (views/import.js).
 */
function backupRow() {
  const kind = signal('everything');
  const status = signal('');
  const incoming = signal(/** @type {any} */ (null));
  const pasting = signal(false);
  const backup = () => makeBackup(settings.peek(), favorites.peek().list, kind.peek());
  const say = (text) => { status.value = text; };
  const fail = (e) => say(t(e.message));
  const pick = (b) => { incoming.value = b; pasting.value = false; say(''); };

  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup(), null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `darkbreezy-${kind.peek() === 'places' ? 'places' : 'settings'}-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(t('Saved to your downloads.'));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(backup(), null, 2)); say(t('Copied. Paste it into Dark Breezy on the other device.')); } catch { say(t('Couldn\'t copy.')); }
  };
  const share = async () => {
    const url = `${location.origin}${location.pathname}#/import/${await packLink(backup())}`;
    if (navigator.share) {
      try { await navigator.share({ title: t('Dark Breezy settings'), url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); say(t('Link copied. Opening it asks before changing anything.')); } catch { say(t('Couldn\'t copy.')); }
  };
  const fromText = async (text) => {
    try { pick(readBackup(isLink(text) ? await unpackLink(text) : text)); } catch (e) { fail(e); }
  };
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) fromText(await f.text());
  } });
  const paste = async () => {
    // Reading the clipboard can be refused (or not offered): then a box to paste into.
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) { fromText(text); return; }
    } catch { /* the box below */ }
    pasting.value = true;
    say('');
  };
  const box = h('textarea.paste-box', { rows: 4, 'aria-label': t('Backup or link to import'), placeholder: t('Paste a backup or a link here') });

  return h('div.setting.setting-stack',
    h('div.setting-text',
      h('span.setting-name', t('Back up and move')),
      h('p.setting-hint', t('Take your settings and places to another browser or device, or keep a copy. A file, a copy to paste, or a link; importing always asks first. Saved weather and the error log stay here.'))),
    segmented('backup-kind', [['everything', t('Everything')], ['places', t('Places only')]], () => kind.value, (v) => { kind.value = v; })('backup-kind'),
    h('p.button-row',
      h('button.btn.btn-small', { type: 'button', onclick: exportFile }, t('Export file')),
      h('button.btn.btn-small', { type: 'button', onclick: copy }, t('Copy')),
      h('button.btn.btn-small', { type: 'button', onclick: share }, icon('share'), t('Share link'))),
    h('p.button-row',
      h('button.btn.btn-small', { type: 'button', onclick: () => file.click() }, t('Import file')),
      h('button.btn.btn-small', { type: 'button', onclick: paste }, t('Paste')),
      file),
    () => pasting.value && h('div.paste-field', box,
      h('p.button-row',
        h('button.btn.btn-small', { type: 'button', onclick: () => fromText(box.value) }, t('Read it')),
        h('button.btn.btn-small', { type: 'button', onclick: () => { pasting.value = false; } }, t('Cancel')))),
    () => incoming.value && importPanel(incoming.value, {
      onDone: (what) => { incoming.value = null; say(t('Imported {what}.', { what })); },
      onCancel: () => { incoming.value = null; },
    }),
    () => status.value && h('p.small.backup-status', { role: 'status' }, status.value));
}

function advanced() {
  const d = installed();
  const log = signal(errorLog());
  const copied = signal('');
  const size = signal(cacheSize());
  markErrorsSeen();
  const copy = async () => {
    try { await navigator.clipboard.writeText(errorReport()); copied.value = t('Copied.'); } catch { copied.value = t('Couldn\'t copy.'); }
  };
  const clearWeather = () => {
    clearCache();
    size.value = cacheSize();
  };
  return h('details.settings-group.advanced',
    h('summary', h('h2', t('Advanced')), icon('chevron-down', 'advanced-chevron')),
    backupRow(),
    h('div.setting',
      h('div.setting-text', h('span.setting-name', t('Version'))),
      h('div.setting-control.setting-value', d ? label(d) : t('development (unbuilt)'))),
    h('div.setting',
      h('div.setting-text', h('span.setting-name', t('Saved weather')), h('p.setting-hint', t('Kept so places open instantly, even offline.'))),
      h('div.setting-control.setting-actions',
        h('span.setting-value', () => t('{n} places, {kb} KB', { n: cachedPlaces().length, kb: Math.round(size.value / 1024) })),
        h('button.btn.btn-small', { type: 'button', onclick: clearWeather }, t('Clear')))),
    h('div.setting',
      h('div.setting-text', h('span.setting-name', t('App files')), h('p.setting-hint', t('If something looks broken or out of date.'))),
      h('div.setting-control.setting-actions',
        h('button.btn.btn-small', { type: 'button', onclick: () => refresh('full') }, icon('refresh'), t('Refresh')),
        h('a.btn.btn-small', { href: 'reset.html' }, t('Reset…')))),
    h('div.setting.setting-stack',
      h('div.setting-text', h('span.setting-name', t('Error log'))),
      () => (log.value.length
        ? h('div.error-log-box',
          h('ul.error-log', log.value.slice(0, 20).map((e) => h('li', h('code', e.message), h('span.small.muted', ` ${e.where} · ${e.last}${e.count > 1 ? ` · ×${e.count}` : ''}`)))),
          h('p.button-row',
            h('button.btn.btn-small', { type: 'button', onclick: copy }, t('Copy report')),
            h('button.btn.btn-small', { type: 'button', onclick: () => { clearErrors(); log.value = errorLog(); } }, t('Clear')),
            () => copied.value && h('span.small', copied.value)))
        : h('p.setting-hint', t('No errors recorded.')))));
}
