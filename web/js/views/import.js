// Importing a backup (util/backup.js): the page a shared link opens
// (#/import/<data>), and the same confirmation in Settings after a file or
// a paste. Nothing is saved until it's confirmed: what's in the backup is
// shown first, places can be added to yours or replace them, and the
// settings can be left out.

import { h } from '../core/h.js';
import { t } from '../core/i18n.js';
import { signal } from '../core/signal.js';
import { navigate } from '../core/router.js';
import { settings } from '../state/settings.js';
import { favorites } from '../state/favorites.js';
import { readBackup, unpackLink, mergePlaces } from '../util/backup.js';
import { setTitle, spinner } from './common.js';

const THEMES = { auto: 'Auto', light: 'Light', dark: 'Dark', contrast: 'High contrast' };
const UNIT_NAMES = { auto: 'Automatic', metric: 'Metric', imperial: 'US', uk: 'UK', custom: 'Chosen each' };
const LAYOUTS = { auto: 'Auto', scroll: 'Scroll', fit: 'Fit' };
const places = (n) => (n === 1 ? t('1 place') : t('{n} places', { n }));

/**
 * What [backup] (readBackup's) holds, and the choices for bringing it in.
 * [onDone](message) after it's saved; [onCancel] to leave it.
 */
export function importPanel(backup, { onDone, onCancel }) {
  const mine = favorites.peek().list;
  const replace = signal(false);
  const withSettings = signal(!!backup.settings);
  const names = backup.favorites.map((p) => p.name);
  const shown = names.length > 8 ? [...names.slice(0, 7), t('and {n} more', { n: names.length - 7 })] : names;
  const s = backup.settings;

  const confirm = () => {
    if (backup.favorites.length) favorites.update((f) => ({ ...f, list: mergePlaces(f.list, backup.favorites, replace.peek()) }));
    if (withSettings.peek()) settings.set(s);
    const n = backup.favorites.length;
    onDone([n && places(n), withSettings.peek() && t('settings')].filter(Boolean).join(t(' and ')));
  };

  return h('div.import-panel', { role: 'group', 'aria-label': t('Import') },
    h('p.import-what', backup.exported ? t('A backup from {date}:', { date: backup.exported }) : t('A backup:')),
    backup.favorites.length > 0 && [
      h('p', h('strong', places(backup.favorites.length)), ': ', shown.join(', ')),
      mine.length > 0 && h('div.segmented', { role: 'radiogroup', 'aria-label': t('Places') },
        [[false, t('Add to my places')], [true, t('Replace my places')]].map(([value, text]) => h('label.segment',
          h('input', { type: 'radio', name: 'import-places', checked: () => replace.value === value, onchange: () => { replace.value = value; } }),
          h('span', text)))),
      () => (replace.value
        ? h('p.small.muted', t('Your {n} places will be swapped for these.', { n: mine.length }))
        : mine.length > 0 && h('p.small.muted', t('New ones go after your {n}; ones you have already are skipped.', { n: mine.length }))),
    ],
    s && h('label.import-settings',
      h('input', { type: 'checkbox', checked: () => withSettings.value, onchange: (e) => { withSettings.value = e.target.checked; } }),
      h('span', h('strong', t('Its settings too')), ' ',
        h('span.small.muted', t('Theme {theme}, units {units}, layout {layout}, {cards} cards: they replace yours.', {
          theme: t(THEMES[s.theme] || s.theme), units: t(UNIT_NAMES[s.units] || s.units), layout: t(LAYOUTS[s.layout] || s.layout),
          cards: s.order.filter((id) => !s.hidden.includes(id)).length,
        })))),
    h('p.button-row',
      h('button.btn.btn-small.btn-primary', { type: 'button', disabled: () => !backup.favorites.length && !withSettings.value, onclick: confirm }, t('Import')),
      h('button.btn.btn-small', { type: 'button', onclick: onCancel }, t('Cancel'))));
}

/** #/import/<data>: a shared link's backup, to confirm. */
export function importView(r) {
  setTitle(t('Import'));
  const state = signal(/** @type {{ backup?: any, error?: string, done?: string } | null} */ (null));
  unpackLink(r.params.data).then(readBackup).then((backup) => { state.value = { backup }; }, (e) => { state.value = { error: t(e.message) }; });
  // Leaving the link's address behind, so Back doesn't offer it again.
  const leave = () => navigate('#/', { replace: true });
  return h('div.sheet.import-page',
    h('h1', t('Import settings and places')),
    () => {
      const st = state.value;
      if (!st) return spinner(t('Reading the link…'));
      if (st.error) return [h('p.card-error', st.error), h('p.button-row', h('button.btn.btn-small', { type: 'button', onclick: leave }, t('Go to the dashboard')))];
      if (st.done) return [h('p', { role: 'status' }, st.done), h('p.button-row', h('button.btn.btn-small.btn-primary', { type: 'button', onclick: leave }, t('Go to the dashboard')))];
      return [
        h('p', t('Someone shared Dark Breezy settings or places with you, or you did from another device. Nothing changes until you choose Import.')),
        importPanel(st.backup, { onDone: (what) => { state.value = { done: t('Imported {what}.', { what }) }; }, onCancel: leave }),
      ];
    });
}
