export const OVERPASS_ENDPOINT = 'https://ovp.dresel.systems/api/interpreter';
export const ALLOWED_RADII = Object.freeze([1000, 5000, 10000, 25000, 50000]);
export const CITIES = Object.freeze({
  helsinki: { name: 'Helsingin keskusta', lat: 60.1699, lon: 24.9384 },
  tampere: { name: 'Tampereen keskusta', lat: 61.4978, lon: 23.7610 },
  turku: { name: 'Turun keskusta', lat: 60.4518, lon: 22.2666 },
  oulu: { name: 'Oulun keskusta', lat: 65.0121, lon: 25.4651 },
});

export class SearchError extends Error {
  constructor(code, message) { super(message); this.name = 'SearchError'; this.code = code; }
}

export function parseCoordinate(value, kind) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new SearchError('coordinates', 'Anna molemmat koordinaatit numeroina, esimerkiksi 60.1699 ja 24.9384.');
  }
  const number = Number(normalized);
  const max = kind === 'lat' ? 90 : 180;
  if (!Number.isFinite(number) || Math.abs(number) > max) {
    throw new SearchError('coordinates', kind === 'lat' ? 'Leveysasteen tulee olla välillä −90–90.' : 'Pituusasteen tulee olla välillä −180–180.');
  }
  return number;
}

export function validatePoint(point) {
  if (!point || typeof point.lat !== 'number' || typeof point.lon !== 'number' || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) {
    throw new SearchError('coordinates', 'Sijainnin koordinaatit eivät ole kelvolliset.');
  }
  return point;
}

export function distanceMeters(a, b) {
  validatePoint(a); validatePoint(b);
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toLocaleString('fi-FI', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

export function buildQuery(point, radius) {
  validatePoint(point);
  if (!ALLOWED_RADII.includes(radius)) throw new SearchError('radius', 'Valitse hakuetäisyys listasta.');
  // Rounding limits precision sent to the provider. Padding covers the maximum
  // rounding displacement; the final radius is enforced locally using exact data.
  return `[out:json][timeout:25];nwr["amenity"="pharmacy"](around:${radius + 200},${point.lat.toFixed(3)},${point.lon.toFixed(3)});out center tags;`;
}

export function safeWebsite(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const text = (value) => typeof value === 'string' ? value.slice(0, 500) : '';

export function normalizePharmacies(data, origin, radius) {
  validatePoint(origin);
  if (!data || !Array.isArray(data.elements)) throw new SearchError('response', 'Karttapalvelu palautti odottamattoman vastauksen. Yritä uudelleen hetken kuluttua.');
  if (data.remark) throw new SearchError('incomplete', 'Karttapalvelu ei saanut hakua valmiiksi. Kokeile pienempää hakuetäisyyttä tai yritä uudelleen hetken kuluttua.');
  const seen = new Set();
  return data.elements.flatMap((element) => {
    if (!element || !['node', 'way', 'relation'].includes(element.type) || !Number.isSafeInteger(element.id) || element.id <= 0 || element.tags?.amenity !== 'pharmacy') return [];
    const id = `${element.type}/${element.id}`;
    if (seen.has(id)) return [];
    const point = element.type === 'node' ? { lat: element.lat, lon: element.lon } : element.center;
    try { validatePoint(point); } catch { return []; }
    const distance = distanceMeters(origin, point);
    if (distance > radius) return [];
    seen.add(id);
    const tags = element.tags;
    const street = [text(tags['addr:street']), text(tags['addr:housenumber'])].filter(Boolean).join(' ');
    const city = [text(tags['addr:postcode']), text(tags['addr:city'])].filter(Boolean).join(' ');
    return [{ id, name: text(tags['name:fi']) || text(tags.name) || text(tags.brand) || 'Apteekki',
      address: [street, city].filter(Boolean).join(', ') || 'Osoitetta ei ole karttatiedoissa',
      lat: point.lat, lon: point.lon, distance, openingHours: text(tags.opening_hours),
      website: safeWebsite(tags.website || tags['contact:website']),
      mapUrl: `https://www.openstreetmap.org/${id}`,
      routeUrl: `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lon}&travelmode=walking`,
    }];
  }).sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, 'fi') || a.id.localeCompare(b.id));
}

export async function fetchPharmacies(point, radius, { signal, fetchImpl = globalThis.fetch, timeoutMs = 32000 } = {}) {
  const query = buildQuery(point, radius);
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const response = await fetchImpl(OVERPASS_ENDPOINT, {
      method: 'POST', body: new URLSearchParams({ data: query }), signal: controller.signal,
      headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store',
    });
    if (!response.ok) {
      if (response.status === 429 || response.status === 504 || response.status === 503) throw new SearchError('busy', 'Karttapalvelu on juuri nyt ruuhkainen. Odota hetki ja yritä uudelleen, tarvittaessa pienemmällä alueella.');
      throw new SearchError('http', 'Karttapalveluun ei saatu yhteyttä. Yritä hetken kuluttua uudelleen.');
    }
    let data;
    try { data = await response.json(); } catch { throw new SearchError('response', 'Karttapalvelun vastausta ei voitu lukea. Yritä uudelleen hetken kuluttua.'); }
    return normalizePharmacies(data, point, radius);
  } catch (error) {
    if (timedOut) throw new SearchError('timeout', 'Haku kesti liian kauan. Kokeile pienempää hakuetäisyyttä tai yritä uudelleen.');
    if (signal?.aborted || error.name === 'AbortError') throw new SearchError('cancelled', 'Haku peruutettiin.');
    if (error instanceof SearchError) throw error;
    throw new SearchError('network', 'Verkkoyhteys tai karttapalvelu ei vastaa. Tarkista yhteys ja yritä uudelleen.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function geolocationMessage(error) {
  if (error?.code === 1) return 'Sijaintilupaa ei annettu. Voit käyttää koordinaatteja tai kaupunkivalintaa.';
  if (error?.code === 3) return 'Sijainnin hakeminen kesti liian kauan. Kokeile uudelleen tai syötä koordinaatit.';
  return 'Sijaintia ei saatu selville. Voit käyttää koordinaatteja tai kaupunkivalintaa.';
}
