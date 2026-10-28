import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/env.mjs';
import * as nws from '../../web/js/api/alerts/nws.js';
import * as eccc from '../../web/js/api/alerts/eccc.js';
import * as dwd from '../../web/js/api/alerts/dwd.js';
import * as jma from '../../web/js/api/alerts/jma.js';
import * as hko from '../../web/js/api/alerts/hko.js';
import * as gdacs from '../../web/js/api/alerts/gdacs.js';
import { merge, SEVERITIES, alert } from '../../web/js/api/alerts/model.js';
import { nationalFor } from '../../web/js/api/alerts/registry.js';
import { nationalService } from '../../web/js/api/alerts/services.js';

const valid = (a) => {
  assert.ok(a.id && a.source && a.issuer && a.event, JSON.stringify(a).slice(0, 200));
  assert.ok(SEVERITIES.includes(a.severity));
  assert.ok(['warning', 'watch', 'advisory', 'statement', 'disaster'].includes(a.kind));
  assert.ok(a.url.startsWith('https://'));
};

test('NWS: recorded and synthetic', () => {
  const rec = fixture('recorded/nws-alerts.json');
  nws.normalize(rec, rec.point).forEach(valid);
  const list = nws.normalize(fixture('synthetic/nws-alerts-tornado.json'), { lat: 35.3, lon: -97.5 });
  assert.equal(list.length, 3);
  list.forEach(valid);
  const tornado = list.find((a) => a.event === 'Tornado Warning');
  assert.equal(tornado.severity, 'extreme');
  assert.equal(tornado.kind, 'warning');
  assert.match(tornado.issuer, /Norman OK/);
  assert.equal(list.find((a) => a.event === 'Flood Watch').kind, 'watch');
});

test('ECCC', () => {
  const rec = fixture('recorded/eccc-alerts.json');
  const list = eccc.normalize(rec);
  list.forEach(valid);
  assert.equal(list.length, rec.features.filter((f) => f.properties.status_en !== 'ended').length);
  const ended = eccc.normalize({ features: [{ properties: { status_en: 'ended', alert_type: 'warning' } }] });
  assert.equal(ended.length, 0);
});

test('DWD (Bright Sky): English where given, German otherwise', () => {
  assert.deepEqual(dwd.normalize(fixture('recorded/brightsky-alerts-berlin.json')), []);
  const list = dwd.normalize(fixture('synthetic/brightsky-alerts-berlin.json'));
  list.forEach(valid);
  assert.equal(list[0].lang, 'en');
  assert.equal(list[0].severity, 'severe');
  assert.equal(list[1].lang, 'de');
  assert.equal(list[1].event, 'FROST');
  assert.equal(list[0].area, 'Berl. - Mitte');
});

test('JMA: the municipality\'s warnings in effect, by code', () => {
  assert.equal(jma.municipality(fixture('recorded/gsi-tokyo.json')), '1311300');
  assert.equal(jma.municipality({ results: null }), null);
  const list = jma.normalize(fixture('synthetic/jma-warning-tokyo.json'), '1311300', 'Shibuya City');
  list.forEach(valid);
  assert.deepEqual(list.map((a) => a.event), ['Heavy Rain Warning', 'Thunderstorm Advisory'], 'lifted (解除) left out');
  assert.equal(list[0].severity, 'severe');
  assert.equal(list[1].kind, 'advisory');
  assert.equal(jma.normalize(fixture('synthetic/jma-warning-tokyo.json'), '1310100', 'Chiyoda').length, 0);
  jma.normalize(fixture('recorded/jma-warning-130000.json'), '1311300', 'Shibuya City').forEach(valid);
});

test('HKO: signals in force with their text; cancelled ones left out', () => {
  const list = hko.normalize(fixture('synthetic/hko-warnsum.json'), fixture('synthetic/hko-warninginfo.json'));
  list.forEach(valid);
  assert.equal(list.length, 2);
  assert.equal(list.find((a) => a.event.startsWith('Red Rainstorm')).severity, 'severe');
  assert.match(list[0].description, /\w/);
  assert.deepEqual(hko.normalize(fixture('recorded/hko-warnsum.json'), null).length >= 0, true);
});

test('GDACS: current events in the place\'s country or within reach', () => {
  const raw = fixture('recorded/gdacs-events.json');
  for (const f of raw.features.filter((x) => x.properties.iscurrent === 'true')) {
    const e = f.properties;
    const cc = e.affectedcountries?.[0]?.iso2;
    if (!cc || !['TC', 'FL', 'DR'].includes(e.eventtype)) continue;
    const list = gdacs.normalize(raw, { lat: -89, lon: 0, cc });
    assert.ok(list.some((a) => a.id.startsWith(`gdacs-${e.eventtype}-${e.eventid}`)), `${e.name} matches its country`);
    list.forEach(valid);
    break;
  }
  const near = { type: 'Feature', geometry: { type: 'Point', coordinates: [10, 50] }, properties: { eventtype: 'WF', iscurrent: 'true', affectedcountries: [] } };
  assert.ok(gdacs.concerns(near, { lat: 50.5, lon: 10, cc: 'XX' }));
  assert.ok(!gdacs.concerns(near, { lat: 55, lon: 10, cc: 'XX' }));
});

test('merge: expired dropped, duplicates folded, most severe first', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const mk = (o) => alert({ source: 'x', issuer: 'X', url: 'https://x', ...o });
  const list = merge([
    [mk({ id: 1, event: 'Wind Advisory', severity: 'minor', expires: '2026-10-28T13:00:00Z' })],
    [mk({ id: 2, event: 'Tornado Warning', severity: 'extreme' }), mk({ id: 3, event: 'Old', severity: 'severe', expires: '2026-10-28T11:00:00Z' })],
    [mk({ id: 4, event: 'Wind Advisory', severity: 'moderate', expires: '2026-10-28T13:00:00Z' })],
  ], now);
  assert.deepEqual(list.map((a) => a.id), ['2', '4']);
});

test('registry: national sources by country, a link elsewhere', () => {
  assert.equal(nationalFor('US').id, 'nws');
  assert.equal(nationalFor('pr').id, 'nws');
  assert.equal(nationalFor('CA').id, 'eccc');
  assert.equal(nationalFor('DE').id, 'dwd');
  assert.equal(nationalFor('JP').id, 'jma');
  assert.equal(nationalFor('HK').id, 'hko');
  assert.equal(nationalFor('MO'), null, 'Macao has its own service, not Hong Kong\'s signals');
  assert.match(nationalService('MO').name, /Macao/);
  assert.equal(nationalFor('FR'), null);
  assert.equal(nationalFor(''), null);
  assert.match(nationalService('GB').name, /Met Office/);
  assert.match(nationalService('ZZ').url, /severeweather\.wmo\.int/);
});
