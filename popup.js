const DEFAULTS = { enabled: true, mode: 'blacklist', whitelist: [], blacklist: [] };

const enabledEl = document.getElementById('enabled');
const modeEl = document.getElementById('mode');
const addInput = document.getElementById('addInput');
const siteBtn = document.getElementById('siteBtn');
const hintEl = document.getElementById('hint');
const siteListEl = document.getElementById('siteList');

let siteHost = null;

const BIN_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">' +
  '<path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Normalizes whatever the user typed into a bare hostname.
function normalizeHost(text) {
  const t = text.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes('://') ? t : 'https://' + t);
    return u.hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

function activeList(settings) {
  return settings.mode === 'whitelist' ? settings.whitelist : settings.blacklist;
}

function inList(list, host) {
  return list.some((d) => host === d || host.endsWith('.' + d));
}

async function getSettings() {
  return chrome.storage.sync.get(DEFAULTS);
}

async function init() {
  const settings = await getSettings();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  siteHost = hostOf(tab?.url);

  enabledEl.checked = settings.enabled;
  modeEl.value = settings.mode;

  if (!siteHost) {
    siteBtn.disabled = true;
    siteBtn.textContent = 'Site button';
    hintEl.textContent = 'Open a website to manage it.';
  } else {
    updateSiteButton(settings);
  }

  renderList(settings);
}

function updateSiteButton(settings) {
  const listed = inList(activeList(settings), siteHost);
  const verb = settings.mode === 'whitelist' ? 'whitelist' : 'blacklist';
  siteBtn.textContent = listed
    ? `Remove from ${verb}`
    : `${verb[0].toUpperCase() + verb.slice(1)} this site`;
  hintEl.textContent = listed
    ? `${siteHost} is ${settings.mode === 'whitelist' ? 'on the whitelist' : 'blacklisted'} - noPause is OFF there.`
    : `${siteHost} is not ${settings.mode === 'whitelist' ? 'whitelisted' : 'blacklisted'} - noPause is ON.`;
}

// The website list box: one row per entry, bin icon to delete.
function renderList(settings) {
  const list = activeList(settings);
  siteListEl.hidden = list.length === 0;
  siteListEl.textContent = '';

  for (const domain of list) {
    const row = document.createElement('div');
    row.className = 'site-row';

    const label = document.createElement('span');
    label.textContent = domain;
    label.title = domain;

    const del = document.createElement('button');
    del.className = 'bin';
    del.title = `Remove ${domain}`;
    del.innerHTML = BIN_SVG;
    del.addEventListener('click', async () => {
      const s = await getSettings();
      const key = s.mode === 'whitelist' ? 'whitelist' : 'blacklist';
      await chrome.storage.sync.set({
        [key]: s[key].filter((d) => d !== domain),
      });
      const fresh = await getSettings();
      if (siteHost) updateSiteButton(fresh);
      renderList(fresh);
    });

    row.append(label, del);
    siteListEl.append(row);
  }
}

enabledEl.addEventListener('change', async () => {
  await chrome.storage.sync.set({ enabled: enabledEl.checked });
});

modeEl.addEventListener('change', async () => {
  await chrome.storage.sync.set({ mode: modeEl.value });
  const settings = await getSettings();
  if (siteHost) updateSiteButton(settings);
  renderList(settings);
});

siteBtn.addEventListener('click', async () => {
  if (!siteHost) return;
  const settings = await getSettings();
  const key = settings.mode === 'whitelist' ? 'whitelist' : 'blacklist';
  const list = settings[key].slice();
  const idx = list.indexOf(siteHost);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(siteHost);
  await chrome.storage.sync.set({ [key]: list });
  const fresh = await getSettings();
  updateSiteButton(fresh);
  renderList(fresh);
});

async function addFromInput() {
  const host = normalizeHost(addInput.value);
  if (!host) return;
  const settings = await getSettings();
  const key = settings.mode === 'whitelist' ? 'whitelist' : 'blacklist';
  if (!inList(settings[key], host)) {
    await chrome.storage.sync.set({ [key]: [...settings[key], host] });
  }
  addInput.value = '';
  addInput.focus();
  const fresh = await getSettings();
  if (siteHost) updateSiteButton(fresh);
  renderList(fresh);
}

addInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addFromInput();
});

init();
