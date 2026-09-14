import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleMapsUrl, normalizeWebsiteUrl } from './url-utils.js';

test('normalizes a website without a scheme', () => {
  assert.equal(normalizeWebsiteUrl(' youtube.com/watch?v=123 '), 'https://youtube.com/watch?v=123');
});

test('keeps explicit HTTP and HTTPS URLs', () => {
  assert.equal(normalizeWebsiteUrl('http://example.com/a'), 'http://example.com/a');
  assert.equal(normalizeWebsiteUrl('https://example.com/a'), 'https://example.com/a');
});

test('rejects executable and malformed URLs', () => {
  assert.throws(() => normalizeWebsiteUrl('javascript:alert(1)'), TypeError);
  assert.throws(() => normalizeWebsiteUrl('https://'), TypeError);
});

test('allows an empty optional website', () => {
  assert.equal(normalizeWebsiteUrl('  '), '');
});

test('creates an encoded Google Maps search URL', () => {
  assert.equal(
    createGoogleMapsUrl('東京都 千代田区 1-1'),
    'https://www.google.com/maps/search/?api=1&query=%E6%9D%B1%E4%BA%AC%E9%83%BD%20%E5%8D%83%E4%BB%A3%E7%94%B0%E5%8C%BA%201-1'
  );
  assert.equal(createGoogleMapsUrl(''), '');
});
