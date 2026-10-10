import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpeed, stepSpeed, sanitizePreferences, resolveContext, siteKey } from '../src/settings.js';

test('precise speeds survive normalization; invalid values never reach media elements', () => {
  for (const speed of [0.5, 1.35, 2.7, 2.75, 3.5, 4.5, 5, 1.234567]) assert.equal(normalizeSpeed(speed), speed);
  for (const value of [NaN, Infinity, -1, 0.49, 5.01, '2', null]) assert.throws(() => normalizeSpeed(value));
  assert.equal(stepSpeed(2.7, 1), 2.8);
  assert.equal(stepSpeed(1.35, -1), 1.25);
  assert.equal(stepSpeed(5, 1), 5);
  assert.equal(stepSpeed(0.5, -1), 0.5);
});
test('site keys use only hostname, without retaining lesson, video or query identifiers', () => {
  assert.equal(siteKey('https://canvas.example.edu/courses/123?secret=value'), 'canvas.example.edu');
  assert.equal(siteKey('http://canvas.example.edu:8000/other'), 'canvas.example.edu');
  assert.equal(siteKey('file:///home/video.mp4'), 'local-files');
  for (const url of ['chrome://extensions', 'about:blank', '', 'not a url']) assert.equal(siteKey(url), null);
});
test('global, website and temporary preferences have deterministic precedence', () => {
  const p = sanitizePreferences({ mode: 'site', globalSpeed: 1.5, sites: { 'example.com': 2.75 } });
  const tab = { id: 9, url: 'https://example.com/video' };
  assert.equal(resolveContext(p, null, tab).speed, 2.75);
  assert.equal(resolveContext(p, { site: 'example.com', speed: 3.5 }, tab).speed, 3.5);
  assert.equal(resolveContext(p, { site: 'other.com', speed: 3.5 }, tab).speed, 2.75);
  assert.equal(resolveContext(p, null, { url: 'https://other.com' }).speed, 1.5);
  p.mode = 'global';
  assert.equal(resolveContext(p, { site: 'example.com', speed: 3.5 }, tab).speed, 1.5);
});
test('corrupted storage falls back safely and removes malformed site speeds', () => {
  const p = sanitizePreferences({ mode: 'invalid', globalSpeed: '5', sites: { a: 0, b: 5, c: NaN } });
  assert.equal(p.mode, 'global');
  assert.equal(p.globalSpeed, 1);
  assert.deepEqual(Object.entries(p.sites), [['b', 5]]);
  assert.equal(sanitizePreferences(null).indicator, true);
});
