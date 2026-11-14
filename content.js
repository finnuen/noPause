// noPause isolated-world script.
// chrome.storage is only reachable from this world, so this script reads the
// settings and forwards them to main.js (same page, main world) via
// window.postMessage.

(() => {
  const DEFAULTS = { enabled: true, mode: 'blacklist', whitelist: [], blacklist: [] };
  const host = location.hostname.replace(/^www\./, '');

  function computeSiteActive(mode, whitelist, blacklist) {
    const match = (list) => list.some((d) => host === d || host.endsWith('.' + d));
    if (mode === 'whitelist') return match(whitelist);
    return !match(blacklist); // blacklist mode (default)
  }

  function push() {
    chrome.storage.sync.get(DEFAULTS, (s) => {
      window.postMessage({
        source: 'nopause',
        type: 'settings',
        enabled: s.enabled !== false,
        siteActive: computeSiteActive(s.mode || 'blacklist', s.whitelist || [], s.blacklist || []),
      }, '*');
    });
  }

  chrome.storage.onChanged.addListener(push);
  push();
})();
