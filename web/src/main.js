import './style.css';
import { attachAutocomplete } from './autocomplete.js';
import { createMap, renderResult, flyToTown } from './map.js';
import { formatDuration, formatMiles } from './format.js';

const stages = {
  landing: document.getElementById('landing'),
  loading: document.getElementById('loading'),
  map: document.getElementById('mapStage'),
};

function show(name) {
  for (const [key, el] of Object.entries(stages)) {
    el.classList.toggle('stage--active', key === name);
  }
}

// --- Landing: inputs, slider, run ---------------------------------------------
const acA = attachAutocomplete(document.querySelector('[data-ac="a"]'), update);
const acB = attachAutocomplete(document.querySelector('[data-ac="b"]'), update);

const runBtn = document.getElementById('run');
const errorEl = document.getElementById('error');
const slider = document.getElementById('threshold');
const threshLabel = document.getElementById('threshLabel');
const exampleEl = document.getElementById('example');

function thresholdFraction() {
  return Number(slider.value) / 100;
}

function updateExample() {
  const t = thresholdFraction();
  threshLabel.textContent = `±${slider.value}%`;
  // On a 10-hour drive, half is 5h; band is [5 - 10t, 5 + 10t] hours.
  const low = formatDuration((5 - 10 * t) * 3600);
  const high = formatDuration((5 + 10 * t) * 3600);
  exampleEl.textContent =
    t === 0
      ? 'On a 10-hour drive, you each drive about 5h.'
      : `On a 10-hour drive, each of you drives between ${low} and ${high}.`;
}

function update() {
  runBtn.disabled = !(acA.value && acB.value);
}

slider.addEventListener('input', updateExample);
updateExample();
update();

runBtn.addEventListener('click', solve);

async function solve() {
  errorEl.hidden = true;
  show('loading');
  startLoadingCycle();

  try {
    const res = await fetch('/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        a: { lat: acA.value.lat, lon: acA.value.lon },
        b: { lat: acB.value.lat, lon: acB.value.lon },
        threshold: thresholdFraction(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    stopLoadingCycle();
    show('map');
    // Let the map container size before rendering.
    ensureMap();
    map.once('idle', () => present(data));
    if (map.loaded()) present(data);
  } catch (err) {
    stopLoadingCycle();
    show('landing');
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

// --- Loading cycle ------------------------------------------------------------
const LOADING_LINES = [
  'Planning routes…',
  'Driving out from both sides…',
  'Mapping the middle…',
  'Measuring drive times…',
  'Ranking towns…',
];
const loadingText = document.getElementById('loadingText');
let loadingTimer = null;
let loadingIdx = 0;

function startLoadingCycle() {
  loadingIdx = 0;
  loadingText.textContent = LOADING_LINES[0];
  loadingTimer = setInterval(() => {
    loadingIdx = (loadingIdx + 1) % LOADING_LINES.length;
    loadingText.style.opacity = 0;
    setTimeout(() => {
      loadingText.textContent = LOADING_LINES[loadingIdx];
      loadingText.style.opacity = 1;
    }, 250);
  }, 1600);
}

function stopLoadingCycle() {
  clearInterval(loadingTimer);
  loadingTimer = null;
}

// --- Map ----------------------------------------------------------------------
let map = null;
function ensureMap() {
  if (!map) map = createMap('map');
  return map;
}

function present(data) {
  renderResult(data, { onPick: (c) => flyToTown(c) });
  renderResults(data);
}

const resultsEl = document.getElementById('results');

function present_chip(label, value) {
  return `<div class="chip"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderResults(data) {
  const { candidates, totalTime, routeDistance, midpoint, meta } = data;
  const head = `
    <div class="results-head">
      <h2>Meet near<br/><span>${midpoint.name}</span></h2>
      <div class="chips">
        ${present_chip('Total drive', formatDuration(totalTime))}
        ${present_chip('Distance', formatMiles(routeDistance))}
        ${present_chip('Towns found', String(meta.candidateCount))}
      </div>
      ${
        meta.widenedBand
          ? `<p class="note">No overlap at your tolerance — widened the band to find a result.</p>`
          : ''
      }
    </div>`;

  const list =
    candidates.length === 0
      ? `<p class="empty">No towns in the fair zone. Showing the geometric midpoint.</p>`
      : `<ul class="town-list">${candidates
          .map(
            (c, i) => `
        <li class="town ${i === 0 ? 'town--best' : ''}" data-i="${i}">
          <div class="town-name">${i === 0 ? '★ ' : ''}${c.name}</div>
          <div class="town-times">
            <span>A ${formatDuration(c.timeA)}</span>
            <span class="split">${c.shareA}% / ${c.shareB}%</span>
            <span>B ${formatDuration(c.timeB)}</span>
          </div>
          <div class="bar"><div class="bar-fill" style="width:${c.shareA}%"></div></div>
        </li>`
          )
          .join('')}</ul>`;

  resultsEl.innerHTML = head + list;

  resultsEl.querySelectorAll('.town').forEach((li) => {
    li.addEventListener('click', () => {
      const c = candidates[Number(li.dataset.i)];
      flyToTown(c);
    });
  });
}

// --- Restart ------------------------------------------------------------------
document.getElementById('restart').addEventListener('click', () => {
  show('landing');
});
