# noPause

Keeps videos and music playing when you switch tabs — a Chromium extension.

![noPause icon](icons/icon128.png)

Switch to another tab and most players pause themselves. noPause refuses those pauses: your video or music keeps going while you read something else, and the tab you came from behaves normally the moment it is visible and focused again.

## Install

**Load unpacked (recommended)**

1. Download and unzip `noPause.zip`.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable *Developer mode*, click *Load unpacked*, and pick the unzipped `noPause` folder.

`.crx` files are signed packages for browsers or setups that allow them. Note that Chrome on Windows refuses drag-installed `.crx` files that did not come from the Web Store, so the zip above is the reliable path.

## Usage

The toolbar button opens a small popup with two controls:

- **Enabled** — the global on/off switch.
- **Site lists** — choose how the per-site list behaves:
  - **Blacklist** (default): noPause is on everywhere *except* the listed sites.
  - **Whitelist**: noPause is off everywhere *except* the listed sites.

Type a domain under *Add a website...* and press Enter to add it, or use the site button to add or remove the site you are currently on. The list below shows every entry, with a bin icon to delete it.

## How it works

The extension injects into the page's own JavaScript world and, while the tab is hidden or unfocused:

- refuses `pause()` calls on playing media,
- resumes anything that still gets paused (caught at the DOM event level, works inside closed shadow DOM),
- hides `visibilitychange` and window `blur` from the page,
- reports `document.hidden`, `visibilityState`, and `hasFocus()` as "visible and focused",
- refuses `AudioContext.suspend()`, source swaps, and muting-while-playing,
- re-plays stalled media with a watchdog.

When the tab is visible and focused again, everything is unhooked — you can pause normally.

## Privacy

noPause collects nothing. The only data it stores is your enable/disable state and site lists in `chrome.storage.sync`, which syncs with your browser profile. No network requests are made.

## Requirements

- Chromium-based browser: Chrome, Edge, Brave, and so on
- Manifest V3
