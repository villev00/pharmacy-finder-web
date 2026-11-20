import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoordinate, validatePoint, distanceMeters, formatDistance, buildQuery, safeWebsite, normalizePharmacies, fetchPharmacies, geolocationMessage, OVERPASS_ENDPOINT } from '../lib.js';

const origin = { lat: 60.1699, lon: 24.9384 };
const node = (id, lat, lon, tags = {}) => ({ type: 'node', id, lat, lon, tags: { amenity: 'pharmacy', name: `Apteekki ${id}`, ...tags } });

test('coordinate input accepts decimal commas, signs and boundary values', () => {
  assert.equal(parseCoordinate(' 60,1699 ', 'lat'), 60.1699);
  assert.equal(parseCoordinate('-180', 'lon'), -180);
  assert.equal(parseCoordinate('+90', 'lat'), 90);
  assert.equal(parseCoordinate('.5', 'lat'), .5);
  assert.equal(parseCoordinate('0', 'lon'), 0);
});

test('coordinate input rejects missing, malformed, non-finite and out-of-range values', () => {
  for (const value of ['', ' ', '60.1abc', '1,2,3', 'NaN', 'Infinity', '1e2', '0x20', '90.1', '-90.1']) assert.throws(() => parseCoordinate(value, 'lat'));
  assert.throws(() => parseCoordinate('180.1', 'lon'));
  assert.throws(() => validatePoint({ lat: '60', lon: 24 }));
  assert.throws(() => validatePoint({ lat: 60, lon: NaN }));
});

test('great-circle distance handles identical points, known distance and antimeridian', () => {
  assert.equal(distanceMeters(origin, origin), 0);
  assert.ok(Math.abs(distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111195) < 2);
  assert.ok(distanceMeters({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 }) < 23000);
  assert.ok(Number.isFinite(distanceMeters({ lat: 90, lon: 0 }, { lat: -90, lon: 0 })));
});

test('display distances use Finnish formatting', () => {
  assert.equal(formatDistance(123), '120 m');
  assert.equal(formatDistance(1500), '1,5 km');
  assert.equal(formatDistance(NaN), '—');
});

test('query rounds shared coordinates, pads radius and includes nodes, ways and relations', () => {
  const query = buildQuery(origin, 5000);
  assert.match(query, /nwr\["amenity"="pharmacy"\]/);
  assert.match(query, /around:5200,60\.170,24\.938/);
  assert.match(query, /out center tags/);
  assert.doesNotMatch(query, /60\.1699/);
  assert.throws(() => buildQuery(origin, 999));
  assert.throws(() => buildQuery({ lat: Infinity, lon: 0 }, 1000));
});

test('normalization sorts actual distances, accepts centers and removes duplicates/invalid/out-of-radius items', () => {
  const near = node(2, 60.1700, 24.9384);
  const data = { elements: [node(1, 60.18, 24.94), near, near,
    { type: 'way', id: 3, center: { lat: 60.1701, lon: 24.9384 }, tags: { amenity: 'pharmacy', name: 'Rakennus' } },
    { type: 'relation', id: 4, center: { lat: 60.1702, lon: 24.9384 }, tags: { amenity: 'pharmacy' } },
    node(5, 65, 25), node(6, NaN, 24), { ...node(7, 60, 24), tags: { amenity: 'cafe' } },
    { type: 'way', id: 8, tags: { amenity: 'pharmacy' } }, node(-1, 60.17, 24.94), null] };
  const results = normalizePharmacies(data, origin, 5000);
  assert.deepEqual(results.map((p) => p.id), ['node/2', 'way/3', 'relation/4', 'node/1']);
  assert.equal(results[2].name, 'Apteekki');
  assert.equal(results[0].address, 'Osoitetta ei ole karttatiedoissa');
});

test('untrusted text remains plain data, website URLs are restricted and route has no origin', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const [result] = normalizePharmacies({ elements: [node(2, 60.17, 24.94, { name: payload, website: 'javascript:alert(1)', 'addr:street': 'Esimerkkikatu', 'addr:housenumber': '1' })] }, origin, 5000);
  assert.equal(result.name, payload);
  assert.equal(result.website, null);
  assert.equal(result.address, 'Esimerkkikatu 1');
  assert.equal(new URL(result.routeUrl).searchParams.has('origin'), false);
  assert.equal(new URL(result.routeUrl).searchParams.get('destination'), '60.17,24.94');
  assert.equal(safeWebsite('https://example.com'), 'https://example.com/');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//example.com', 'https://user:pass@example.com', 'not a url']) assert.equal(safeWebsite(url), null);
});

test('incomplete and malformed responses are never presented as successful empty searches', () => {
  assert.throws(() => normalizePharmacies({ remark: 'runtime error: timeout', elements: [] }, origin, 5000), { code: 'incomplete' });
  assert.throws(() => normalizePharmacies({}, origin, 5000), { code: 'response' });
  assert.deepEqual(normalizePharmacies({ elements: [] }, origin, 5000), []);
});

test('fetch uses one credential-free POST and normalizes the response', async () => {
  let calls = 0;
  const results = await fetchPharmacies(origin, 5000, { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, OVERPASS_ENDPOINT);
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.match(options.body.get('data'), /60\.170,24\.938/);
    return { ok: true, json: async () => ({ elements: [node(1, 60.17, 24.94)] }) };
  } });
  assert.equal(calls, 1);
  assert.equal(results.length, 1);
});

test('fetch maps HTTP rate limits, network failure and invalid JSON to helpful errors', async () => {
  await assert.rejects(fetchPharmacies(origin, 5000, { fetchImpl: async () => ({ ok: false, status: 429 }) }), { code: 'busy' });
  await assert.rejects(fetchPharmacies(origin, 5000, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), { code: 'network' });
  await assert.rejects(fetchPharmacies(origin, 5000, { fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid'); } }) }), { code: 'response' });
});

test('request cancellation and timeout remain distinguishable', async () => {
  const waitForAbort = async (_url, { signal }) => new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(new DOMException('Abort', 'AbortError')), { once: true }); });
  await assert.rejects(fetchPharmacies(origin, 5000, { fetchImpl: waitForAbort, timeoutMs: 5 }), { code: 'timeout' });
  const controller = new AbortController();
  const request = fetchPharmacies(origin, 5000, { fetchImpl: waitForAbort, signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { code: 'cancelled' });
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(fetchPharmacies(origin, 5000, { signal: cancelled.signal, fetchImpl: async () => { throw new Error('Should not run'); } }), { code: 'cancelled' });
});

test('location failures offer a manual path', () => {
  assert.match(geolocationMessage({ code: 1 }), /Sijaintilupaa ei annettu/);
  assert.match(geolocationMessage({ code: 3 }), /kesti liian kauan/);
  assert.match(geolocationMessage({ code: 2 }), /koordinaatteja/);
});
