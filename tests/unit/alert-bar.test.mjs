// The warnings bar's text (web/js/widgets/alert-bar.js): pages of what fits
// the line, each shown for about its reading time.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/env.mjs';
import { pages, pageTime, warningText, MIN_PAGE, MAX_PAGE } from '../../web/js/widgets/alert-bar.js';

test('pages break between sentences, within the budget', () => {
  const text = 'One two three. Four five six! Seven eight nine? Ten.';
  assert.deepEqual(pages(text, 30), ['One two three. Four five six!', 'Seven eight nine? Ten.']);
  assert.deepEqual(pages(text, 200), [text]);
  for (const p of pages(text, 30)) assert.ok(p.length <= 30);
});

test('a sentence longer than the line breaks between words', () => {
  const long = 'Minor to moderate flooding of low lying property and roads near the shore is expected at high tide.';
  const out = pages(long, 40);
  assert.ok(out.length >= 3);
  assert.ok(out.every((p) => p.length <= 40), out.join(' | '));
  assert.equal(out.join(' '), long);
});

test('reading time, within bounds', () => {
  assert.equal(pageTime('Take cover'), MIN_PAGE);
  assert.equal(pageTime(Array(30).fill('word').join(' ')), 9000);
  assert.equal(pageTime(Array(200).fill('word').join(' ')), MAX_PAGE);
});

test('a warning\'s text: headline (if it adds anything), instruction, description', () => {
  assert.equal(warningText({ event: 'Flood Watch', headline: 'Flood Watch', instruction: 'Move to higher ground.', description: 'Rivers rising.' }), 'Move to higher ground. Rivers rising.');
  assert.equal(warningText({ event: 'Storm', headline: 'Official WARNING of STORM', instruction: '', description: 'Gusts  70 km/h.\n' }), 'Official WARNING of STORM Gusts 70 km/h.');
});
