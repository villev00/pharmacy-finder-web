import { CITIES, SearchError, parseCoordinate, formatDistance, fetchPharmacies, geolocationMessage } from './lib.js';

const $ = (id) => document.getElementById(id);
const controls = [...document.querySelectorAll('#search button:not(#cancel), #search input, #search select')];
let active = null;
let generation = 0;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function status(message = '', kind = '') {
  $('status').replaceChildren();
  if (message) $('status').append(el('p', `notice ${kind}`, message));
}

function busy(value) {
  controls.forEach((control) => { control.disabled = value; });
  $('cancel').hidden = !value;
  $('results-section').setAttribute('aria-busy', String(value));
}

function resetResults() {
  $('results').replaceChildren();
  $('result-count').hidden = true;
  $('result-footnote').hidden = true;
  $('empty-state').hidden = true;
}

function showEmpty(title, copy) {
  $('empty-title').textContent = title;
  $('empty-copy').textContent = copy;
  $('empty-state').hidden = false;
}

function link(label, href, className) {
  const anchor = el('a', className, label);
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}

function render(pharmacies) {
  const fragment = document.createDocumentFragment();
  pharmacies.slice(0, 100).forEach((pharmacy, index) => {
    const item = el('li', 'pharmacy-card');
    const rank = el('span', 'result-rank', String(index + 1));
    rank.setAttribute('aria-hidden', 'true');
    const content = el('div', 'pharmacy-content');
    content.append(el('h3', 'pharmacy-name', pharmacy.name), el('p', 'pharmacy-address', pharmacy.address));
    if (pharmacy.openingHours) {
      const hours = el('p', 'pharmacy-hours');
      hours.append(el('strong', '', 'Aukiolo karttatiedoissa: '), document.createTextNode(pharmacy.openingHours));
      content.append(hours);
    }
    const links = el('div', 'pharmacy-links');
    const route = link('Avaa reitti ↗', pharmacy.routeUrl, 'route-link');
    route.setAttribute('aria-label', `Avaa kävelyreitti: ${pharmacy.name} (Google Maps, uusi välilehti)`);
    links.append(route, link('Karttatiedot ↗', pharmacy.mapUrl, 'secondary-link'));
    if (pharmacy.website) links.append(link('Verkkosivu ↗', pharmacy.website, 'secondary-link'));
    content.append(links);
    const distance = el('div', 'distance', formatDistance(pharmacy.distance));
    distance.append(el('small', '', index === 0 ? 'LÄHIN LÖYDETTY' : 'LINNUNTIETÄ'));
    item.append(rank, content, distance);
    fragment.append(item);
  });
  $('results').replaceChildren(fragment);
  $('result-count').textContent = String(pharmacies.length);
  $('result-count').hidden = false;
  $('result-footnote').hidden = pharmacies.length === 0;
}

async function search(point, label, existingToken) {
  const token = existingToken ?? ++generation;
  active?.abort();
  active = new AbortController();
  const radius = Number($('radius').value);
  busy(true);
  resetResults();
  $('results-title').textContent = 'Etsitään läheltäsi.';
  $('search-context').textContent = `${label} · ${radius / 1000} km:n säde`;
  status('Haetaan apteekkeja avoimesta karttadatasta…', 'loading');
  try {
    const pharmacies = await fetchPharmacies(point, radius, { signal: active.signal });
    if (token !== generation) return;
    render(pharmacies);
    $('results-title').textContent = pharmacies.length ? 'Askel lähemmäs apteekkia.' : 'Laajennetaanko hakua?';
    status(pharmacies.length ? `${pharmacies.length} apteekkia löytyi. ${pharmacies.length > 100 ? 'Näytetään 100 lähintä. ' : ''}Lähin on ${formatDistance(pharmacies[0].distance)} päässä linnuntietä.` : 'Valitulta alueelta ei löytynyt apteekkeja.');
    if (!pharmacies.length) showEmpty('Ei apteekkeja tällä alueella.', 'Valitse suurempi hakuetäisyys tai toinen sijainti. Haku kattaa Euroopan aineiston, josta voi myös puuttua apteekkeja.');
  } catch (error) {
    if (token !== generation) return;
    $('results-title').textContent = 'Kokeillaan uudelleen.';
    status(error instanceof SearchError ? error.message : 'Haku epäonnistui. Yritä uudelleen.', 'error');
    showEmpty('Haku ei valmistunut.', 'Voit muuttaa hakukeskusta tai etäisyyttä ja yrittää uudelleen.');
  } finally {
    if (token === generation) { active = null; busy(false); }
  }
}

$('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const point = { lat: parseCoordinate($('latitude').value, 'lat'), lon: parseCoordinate($('longitude').value, 'lon') };
    search(point, `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`);
  } catch (error) { status(error.message, 'error'); }
});

document.querySelectorAll('[data-city]').forEach((button) => {
  button.addEventListener('click', () => {
    const city = CITIES[button.dataset.city];
    $('latitude').value = String(city.lat);
    $('longitude').value = String(city.lon);
    search(city, city.name);
  });
});

$('locate').addEventListener('click', () => {
  if (!window.isSecureContext || !navigator.geolocation) {
    status('Sijaintihaku tarvitsee HTTPS-yhteyden ja sitä tukevan selaimen. Voit käyttää koordinaatteja tai kaupunkivalintaa.', 'error');
    return;
  }
  const token = ++generation;
  active?.abort();
  busy(true);
  resetResults();
  $('results-title').textContent = 'Paikannetaan hakukeskus.';
  $('search-context').textContent = 'Sijaintia käytetään vain tätä hakua varten.';
  status('Odotetaan selaimen sijaintia…', 'loading');
  navigator.geolocation.getCurrentPosition((position) => {
    if (token !== generation) return;
    const point = { lat: position.coords.latitude, lon: position.coords.longitude };
    $('latitude').value = point.lat.toFixed(4);
    $('longitude').value = point.lon.toFixed(4);
    const accuracy = Number.isFinite(position.coords.accuracy) ? ` (selaimen tarkkuus noin ${Math.round(position.coords.accuracy)} m)` : '';
    search(point, `Nykyinen sijaintisi${accuracy}`, token);
  }, (error) => {
    if (token !== generation) return;
    busy(false);
    status(geolocationMessage(error), 'error');
    $('results-title').textContent = 'Valitse hakukeskus itse.';
    showEmpty('Myös ilman sijaintilupaa.', 'Syötä koordinaatit tai kokeile jotakin kaupunkien keskustavalinnoista.');
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
});

$('cancel').addEventListener('click', () => {
  ++generation;
  active?.abort();
  active = null;
  busy(false);
  resetResults();
  $('results-title').textContent = 'Jatka, kun olet valmis.';
  status('Haku peruutettiin.');
  showEmpty('Hakua ei jatketa.', 'Voit aloittaa uuden haun valitsemallasi sijainnilla.');
});
