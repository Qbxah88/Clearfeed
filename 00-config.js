// ---------------------------------------------------------------------------
// ClearFeed TV: settings
//
// Settings come from two places, merged in this order:
//   1. DEFAULTS below
//   2. a remote settings.json (served over HTTPS, e.g. from your GitHub repo
//      through jsDelivr, or later from the ClearFeed hub)
//   3. local overrides saved on this TV (localStorage)
// The remote file is cached locally so the TV still filters when offline.
// ---------------------------------------------------------------------------

var CF_STORAGE_KEY = 'clearfeed-tv';
var CF_LOG_KEY = 'clearfeed-tv-log';
var CF_VERSION = '1.0.0';

var CF_DEFAULTS = {
  // Where to fetch shared settings from. Leave empty to use local settings only.
  // raw.githubusercontent.com refreshes within about five minutes of a commit.
  settingsUrl: 'https://raw.githubusercontent.com/CHANGE-ME/clearfeed-tv/main/settings.json',
  refreshMinutes: 10,

  // Category switches (same four categories as the browser extension)
  categories: {
    hateful: true,
    materialism: true,
    degrading: true,
    religious: true
  },
  // Extra words per category, added to the built-in lists
  extraWords: { hateful: [], materialism: [], degrading: [], religious: [] },
  // Words from the built-in lists you want switched off
  disabledWords: [],
  // Phrases that should never trigger a filter
  alwaysAllow: [],

  // Blocked creators: channel names, @handles or channel IDs (UC...)
  blockedCreators: [],
  // Blocked single videos: 11-character video IDs
  blockedVideos: [],
  // Blocked searches: words or phrases. A search containing any of them is refused.
  blockedSearches: [],
  // Block every search (YouTube Kids style). Overrides blockedSearches.
  blockAllSearches: false,
  // Trusted creators: their videos are never filtered
  trustedCreators: [],

  // Hide Shorts shelves and the Shorts tab entirely
  hideShorts: false,
  // Show a short toast when things get hidden
  showToasts: true,
  // Keep this many hidden entries in the on-TV log
  logSize: 200
};

var cfSettings = null;

function cfDeepMerge(base, extra) {
  var out = {};
  var k;
  for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
  if (!extra || typeof extra !== 'object') return out;
  for (k in extra) {
    if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
    var b = out[k], e = extra[k];
    if (b && e && typeof b === 'object' && typeof e === 'object' && !Array.isArray(b) && !Array.isArray(e)) {
      out[k] = cfDeepMerge(b, e);
    } else {
      out[k] = e;
    }
  }
  return out;
}

function cfReadStore() {
  try {
    var raw = window.localStorage.getItem(CF_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function cfWriteStore(store) {
  try { window.localStorage.setItem(CF_STORAGE_KEY, JSON.stringify(store)); } catch (e) { }
}

// Build the live settings object from defaults + cached remote + local overrides
function cfRebuildSettings() {
  var store = cfReadStore();
  var s = cfDeepMerge(CF_DEFAULTS, store.remote || {});
  s = cfDeepMerge(s, store.local || {});
  cfSettings = s;
  cfCompileFilters();
  return s;
}

function cfGet(key) {
  if (!cfSettings) cfRebuildSettings();
  return cfSettings[key];
}

// Local override (e.g. from an on-TV action)
function cfSetLocal(key, value) {
  var store = cfReadStore();
  store.local = store.local || {};
  store.local[key] = value;
  cfWriteStore(store);
  cfRebuildSettings();
}

// Fetch the remote settings file with XMLHttpRequest (works on old TV browsers)
function cfFetchRemoteSettings(done) {
  var url = cfGet('settingsUrl');
  if (!url || url.indexOf('CHANGE-ME') !== -1) { if (done) done(false); return; }
  try {
    var xhr = new XMLHttpRequest();
    // cache-buster so jsDelivr/branch URLs refresh
    xhr.open('GET', url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Math.floor(Date.now() / 60000), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var remote = JSON.parse(xhr.responseText);
          if (remote && typeof remote === 'object') {
            var store = cfReadStore();
            store.remote = remote;
            store.remoteFetchedAt = Date.now();
            cfWriteStore(store);
            cfRebuildSettings();
            if (done) done(true);
            return;
          }
        } catch (e) { }
      }
      if (done) done(false);
    };
    xhr.send();
  } catch (e) { if (done) done(false); }
}

function cfStartSettingsRefresh() {
  cfFetchRemoteSettings();
  var mins = Number(cfGet('refreshMinutes')) || 10;
  setInterval(cfFetchRemoteSettings, Math.max(1, mins) * 60 * 1000);
}
