// Official warnings for the place (DARKBREEZY.md decision 5): published by
// the agencies, shown as data on the dashboard. Never a popup; the list is
// a polite live region, announced once when it changes. Each warning names
// its issuer and links to the issuer's own page.

import { h, icon } from '../core/h.js';
import { t } from '../core/i18n.js';
import { fmtDateTime } from '../util/time.js';
import { card, errorCard, loadingCard } from './common.js';
import { alertBar } from './alert-bar.js';

const SEVERITY = { extreme: 'Extreme', severe: 'Severe', moderate: 'Moderate', minor: 'Minor', unknown: 'Unknown severity' };

/** Ids of the warnings the user opened, so a refresh keeps them open. */
const open = new Set();

function item(a, ctx) {
  const until = a.expires ? t('until {time}', { time: fmtDateTime(a.expires, ctx.tz, ctx.clock) }) : '';
  const details = h('details.alert', { dataset: { severity: a.severity }, open: open.has(a.id),
    ontoggle: (e) => { if (e.target.open) open.add(a.id); else open.delete(a.id); } },
  h('summary',
    h('span.alert-badge', SEVERITY[a.severity]),
    h('span.alert-event', a.event),
    h('span.alert-when', [a.area && a.area.length < 60 ? a.area : '', until].filter(Boolean).join(' · ')),
    icon('chevron-down', 'alert-chevron')),
  h('div.alert-body',
    a.headline && a.headline !== a.event && h('p.alert-headline', a.headline),
    a.description && h('p.alert-text', { lang: a.lang }, a.description),
    a.instruction && h('p.alert-text.alert-instruction', { lang: a.lang }, a.instruction),
    a.area && a.area.length >= 60 && h('p.small.muted', t('Area: {area}', { area: a.area })),
    h('p.alert-issuer.small',
      t('Issued by {issuer}', { issuer: a.issuer }),
      a.onset && ` · ${fmtDateTime(a.onset, ctx.tz, ctx.clock)}`,
      a.url && [' · ', h('a', { href: a.url, target: '_blank', rel: 'noopener' }, t('Official page'))])));
  return details;
}

export const warnings = {
  uses: ['alerts'],
  render(ctx) {
    const slot = ctx.wx.alerts;
    const title = t('Warnings');
    if (!slot) return null;
    if (slot.data == null) {
      if (slot.error) return errorCard('warnings', title, slot.error, () => ctx.retry('alerts'), 'wide');
      return loadingCard('warnings', title, 'wide');
    }
    const r = slot.data;
    // The ticker (Settings › Warnings ticker): a thin bar (widgets/alert-bar.js).
    if (ctx.bar && r.alerts.length) return alertBar(r.alerts, ctx, { interactive: !ctx.wallpaper, cls: ['wide', 'no-fill'] });
    const body = [];
    // The country has its own source but it didn't answer: that's "couldn't check", not "none".
    const nationalFailed = !r.service && r.coverage !== 'national' && r.failed.length > 0;
    if (r.alerts.length) {
      body.push(h('div.alert-list', r.alerts.map((a) => item(a, ctx))));
    } else if (nationalFailed) {
      body.push(h('div.card-error',
        h('p', t('Couldn\'t check for official warnings ({list}).', { list: r.failed.join(', ') })),
        h('button.btn.btn-small', { type: 'button', onclick: () => ctx.retry('alerts') }, icon('refresh'), t('Try again'))));
    } else {
      body.push(h('p.no-alerts', t('No warnings in effect.')));
    }
    if (r.coverage !== 'national' && r.service) {
      body.push(h('p.small.muted.coverage-note',
        t('Official national warnings aren\'t available here in Dark Breezy; only major disasters (GDACS) are shown. Check '),
        h('a', { href: r.service.url, target: '_blank', rel: 'noopener' }, r.service.name), '.'));
    }
    if (r.failed.length && !(nationalFailed && !r.alerts.length)) body.push(h('p.small.muted', t('Couldn\'t check: {list}.', { list: r.failed.join(', ') })));
    const top = r.alerts[0]?.severity;
    return card('warnings', r.alerts.length ? t('Warnings ({n})', { n: r.alerts.length }) : title,
      h('div', { 'aria-live': 'polite' }, body),
      { cls: ['wide', top ? `has-alerts top-${top}` : 'no-alerts-card'] });
  },
};
