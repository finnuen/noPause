// noPause main-world script.
// Runs at document_start in the SAME world as the page, so every patch here
// applies to the site's own JavaScript (an isolated-world content script
// cannot do that - that is why reddit ignored the first version).
//
// Settings arrive from content.js (isolated world) via window.postMessage,
// because main-world scripts have no access to chrome.storage.
//
// Every pause vector covered:
//   1. media.pause()                       -> refused while hidden/unfocused
//   2. any pause that still happens        -> pause event caught, play() back
//   3. watchdog re-play of stalled media   -> 250 ms, shadow-DOM aware
//   4. visibilitychange handlers           -> event blocked while hidden
//   5. document.hidden / visibilityState   -> spoofed as visible
//   6. document.hasFocus()                 -> spoofed as focused
//   7. window blur / onblur handlers       -> event blocked while active
//   8. AudioContext.suspend()              -> refused while hidden/unfocused
//   9. load() / src swap / removeAttribute('src') / muted
//      while the element is playing        -> refused

(() => {
  // Native references captured before any page code can touch them.
  const nativeHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get;
  const nativeHasFocus = Document.prototype.hasFocus;
  const proto = HTMLMediaElement.prototype;
  const origPause = proto.pause;
  const origLoad = proto.load;
  const origSetAttr = proto.setAttribute;
  const origRemoveAttr = proto.removeAttribute;
  const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
  const mutedDesc = Object.getOwnPropertyDescriptor(proto, 'muted');

  const state = { ready: false, enabled: true, siteActive: true };

  const settingsActive = () => state.ready && state.enabled && state.siteActive;

  // A pause attempt is refused while the tab is hidden OR unfocused.
  // The "unfocused" part matters: sites that pause on window blur fire before
  // document.hidden flips to true.
  const isBlocked = () => settingsActive() &&
    (nativeHidden.call(document) || !nativeHasFocus.call(document));

  // Elements that should be playing right now.
  const shouldPlay = new WeakSet();

  // True when a source change / load / mute would silently kill playback.
  const wouldKillPlayback = (m) =>
    isBlocked() && m instanceof HTMLMediaElement && !m.paused && !m.ended;

  // 1. Refuse pause() while blocked.
  proto.pause = function () {
    if (isBlocked() && !this.paused && !this.ended) {
      shouldPlay.add(this);
      return undefined;
    }
    if (!isBlocked()) shouldPlay.delete(this);
    return origPause.call(this);
  };

  // 2. If anything pauses a playing element by any other route, resume it.
  //    (capture listener on document also hears events from closed shadow DOM)
  document.addEventListener('pause', (e) => {
    const m = e.target;
    if (!(m instanceof HTMLMediaElement)) return;
    if (isBlocked() && !m.ended) {
      shouldPlay.add(m);
      m.play().catch(() => {});
    } else if (!isBlocked()) {
      shouldPlay.delete(m);
    }
  }, true);

  document.addEventListener('playing', (e) => {
    const m = e.target;
    if (m instanceof HTMLMediaElement) shouldPlay.add(m);
  }, true);

  // 3. Hide visibilitychange from the page while hidden (this listener is
  //    registered before any site code, so stopImmediatePropagation wins).
  const hideVisibility = (e) => {
    if (settingsActive() && nativeHidden.call(document)) e.stopImmediatePropagation();
  };
  document.addEventListener('visibilitychange', hideVisibility, true);
  document.addEventListener('webkitvisibilitychange', hideVisibility, true);

  // 4. Block window blur handlers (sites that pause on blur never fire).
  window.addEventListener('blur', (e) => {
    if (isBlocked()) e.stopImmediatePropagation();
  }, true);

  // 5. Watchdog: re-play anything that should be playing but stalled
  //    (covers elements paused via paths the event listener cannot revert).
  function collectMedia(root, out) {
    if (!root.querySelectorAll) return;
    for (const m of root.querySelectorAll('audio, video')) out.push(m);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) collectMedia(el.shadowRoot, out);
    }
  }

  setInterval(() => {
    if (!isBlocked()) return;
    const list = [];
    collectMedia(document, list);
    for (const m of list) {
      if (shouldPlay.has(m) && m.paused && !m.ended && (m.src || m.currentSrc)) {
        m.play().catch(() => {});
      }
    }
  }, 250);

  // 6. Refuse AudioContext.suspend() while blocked (Web Audio based players).
  if (window.AudioContext && AudioContext.prototype) {
    const acProto = AudioContext.prototype;
    const origSuspend = acProto.suspend;
    acProto.suspend = function () {
      if (isBlocked() && this.state === 'running') return Promise.resolve();
      return origSuspend.call(this);
    };
  }

  // 7. Refuse ways of stopping media without pause().
  proto.load = function () {
    if (wouldKillPlayback(this)) return undefined;
    return origLoad.call(this);
  };

  if (srcDesc && srcDesc.set) {
    Object.defineProperty(proto, 'src', {
      configurable: true,
      enumerable: srcDesc.enumerable,
      get: srcDesc.get,
      set: function (v) {
        if (wouldKillPlayback(this)) return;
        srcDesc.set.call(this, v);
      },
    });
  }

  proto.setAttribute = function (name, value) {
    if (typeof name === 'string' && name.toLowerCase() === 'src' && wouldKillPlayback(this)) {
      return undefined;
    }
    return origSetAttr.call(this, name, value);
  };

  proto.removeAttribute = function (name) {
    if (typeof name === 'string' && name.toLowerCase() === 'src' && wouldKillPlayback(this)) {
      return undefined;
    }
    return origRemoveAttr.call(this, name);
  };

  if (mutedDesc && mutedDesc.set) {
    Object.defineProperty(proto, 'muted', {
      configurable: true,
      enumerable: mutedDesc.enumerable,
      get: mutedDesc.get,
      set: function (v) {
        if (wouldKillPlayback(this) && !!v) return;
        mutedDesc.set.call(this, v);
      },
    });
  }

  // 8. Spoof visibility / focus getters for sites that poll instead of listen.
  let spoofed = false;
  function applySpoof() {
    if (settingsActive() && !spoofed) {
      Object.defineProperty(document, 'hidden', {
        configurable: true, get: () => false,
      });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true, get: () => 'visible',
      });
      Object.defineProperty(document, 'hasFocus', {
        configurable: true, value: () => true,
      });
      spoofed = true;
    } else if (!settingsActive() && spoofed) {
      delete document.hidden;
      delete document.visibilityState;
      delete document.hasFocus;
      spoofed = false;
    }
  }

  // --- settings relay from the isolated world ---
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== 'nopause' || d.type !== 'settings') return;
    state.enabled = !!d.enabled;
    state.siteActive = !!d.siteActive;
    state.ready = true;
    applySpoof();
  });
})();
