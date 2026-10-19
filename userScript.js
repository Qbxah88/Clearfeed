/* ClearFeed TV v1.2.0 — built 2026-10-19T10:31:23.982Z */
(function () {
'use strict';

// ===== 00-config.js =====
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
var CF_VERSION = '1.2.0';

var CF_DEFAULTS = {
  // Where to fetch shared settings from. Leave empty to use local settings only.
  // raw.githubusercontent.com refreshes within about five minutes of a commit.
  settingsUrl: 'https://raw.githubusercontent.com/Qbxah88/Clearfeed/main/settings.json',
  // Same file through jsDelivr, used if GitHub can't be reached from the TV
  settingsCdnUrl: 'https://cdn.jsdelivr.net/gh/Qbxah88/Clearfeed@main/settings.json',
  refreshMinutes: 10,

  // Category switches (same four categories as the browser extension)
  categories: {
    hateful: true,
    materialism: true,
    degrading: true,
    religious: true,
    lowMood: true
  },
  // Extra words per category, added to the built-in lists
  extraWords: { hateful: [], materialism: [], degrading: [], religious: [], lowMood: [] },
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
  logSize: 200,

  // ClearFeed hub (optional). Put this block in settings.json on GitHub once;
  // from then on settings are read from the hub and the TV sends its log there.
  hub: { url: '', deviceKey: '', tvName: 'Samsung TV' }
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

// JSON request helper for old TV browsers. Tries XMLHttpRequest first and,
// if that fails before reaching the server (status 0), the fetch API, since
// the YouTube app wraps one or the other on some firmware. Uses text/plain so
// cross-origin POSTs don't need a preflight.
var cfOrigXhr = window.XMLHttpRequest;
var cfOrigFetch = window.fetch;
// The ClearFeed relay service (service.js) running inside TizenBrew on the TV.
// On firmware where the YouTube page may not talk to outside addresses, every
// request goes through it instead.
var CF_RELAY = 'http://127.0.0.1:8766';
var cfRelayWorks = null; // null = unknown, true/false once tried

function cfRawXhr(method, url, body, done) {
  try {
    var xhr = new cfOrigXhr();
    xhr.open(method, url, true);
    if (body) xhr.setRequestHeader('Content-Type', 'text/plain');
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var data = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { data = cfOrigParse(xhr.responseText); } catch (e) { data = null; }
      }
      done(data, xhr.status);
    };
    xhr.send(body ? JSON.stringify(body) : null);
  } catch (e) { done(null, 0); }
}

function cfXhrJson(method, url, body, done) {
  var finished = false;
  function finish(data, status, how) { if (finished) return; finished = true; done(data, status, how); }
  function viaRelay(prefix) {
    if (url.indexOf('http://127.0.0.1') === 0 || cfRelayWorks === false) { finish(null, 0, prefix); return; }
    cfRawXhr(method, CF_RELAY + '/relay?url=' + encodeURIComponent(url), body, function (d, st) {
      if (st === 0) { cfRelayWorks = false; finish(null, 0, prefix + ' relay0'); return; }
      cfRelayWorks = true;
      finish(d, st, 'relay');
    });
  }
  function viaFetch() {
    if (typeof cfOrigFetch !== 'function') { viaRelay('xhr0'); return; }
    try {
      cfOrigFetch(url, { method: method, headers: body ? { 'Content-Type': 'text/plain' } : {}, body: body ? JSON.stringify(body) : undefined, mode: 'cors', credentials: 'omit' })
        .then(function (r) { return r.text().then(function (t) { var d = null; try { d = cfOrigParse(t); } catch (e) { } finish(r.ok ? d : null, r.status, 'fetch'); }); })
        .catch(function () { viaRelay('xhr0 fetch0'); });
    } catch (e) { viaRelay('xhr0 fetchX'); }
  }
  // Once the relay is known to be the only way, go straight to it
  if (cfRelayWorks === true && url.indexOf('http://127.0.0.1') !== 0) { viaRelay('direct-skipped'); return; }
  cfRawXhr(method, url, body, function (data, status) {
    if (status === 0) { viaFetch(); return; }
    finish(data, status, 'xhr');
  });
}

function cfHub() {
  var h = cfGet('hub');
  if (!h || !h.url || !h.deviceKey) return null;
  return { url: String(h.url).replace(/\/+$/, ''), key: h.deviceKey, name: h.tvName || 'Samsung TV' };
}

function cfStoreRemote(remote) {
  var store = cfReadStore();
  store.remote = remote;
  store.remoteFetchedAt = Date.now();
  cfWriteStore(store);
  cfRebuildSettings();
}

// Last HTTP status of each fetch, shown in the blue-button header for diagnosis
var cfFetchStatus = { gh: '-', cdn: '-', proxy: '-', same: '-', hub: '-', post: '-' };

// TizenBrew's service proxies jsDelivr on the TV itself; a last resort for the
// settings file if the page can't make outside requests directly.
var CF_PROXY_URL = 'http://127.0.0.1:8081/module/' + encodeURIComponent('gh/Qbxah88/Clearfeed@main') + '/settings.json';

// Control probe: a same-origin request. If this also fails, the problem is in
// this script, not the network.
function cfProbeSameOrigin() {
  cfXhrJson('GET', '/youtubei/v1/ping?t=' + Date.now(), null, function (d, st, how) { cfFetchStatus.same = st + (how ? how : ''); });
}

// Fetch settings: first the GitHub file (which may only point at the hub),
// falling back to the jsDelivr copy, then, if a hub is configured, the hub's
// settings on top of it.
function cfFetchRemoteSettings(done) {
  var url = cfGet('settingsUrl');
  if (!url) { if (done) done(false); return; }
  var cdnUrl = cfGet('settingsCdnUrl');
  function gotFile(gh) {
    var hub = gh.hub && gh.hub.url && gh.hub.deviceKey ? gh.hub : null;
    if (!hub) { cfStoreRemote(gh); if (done) done(true); return; }
    var hurl = String(hub.url).replace(/\/+$/, '');
    cfXhrJson('GET', hurl + '/settings?k=' + encodeURIComponent(hub.deviceKey) + '&t=' + Date.now(), null, function (hs, st) {
      cfFetchStatus.hub = st;
      var merged = cfDeepMerge(gh, hs && typeof hs === 'object' ? hs : {});
      merged.hub = gh.hub;
      cfStoreRemote(merged);
      if (done) done(true);
    });
  }
  cfXhrJson('GET', url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Math.floor(Date.now() / 60000), null, function (gh, st, how) {
    cfFetchStatus.gh = st + (how && how !== 'xhr' ? '(' + how + ')' : '');
    if (gh && typeof gh === 'object') { gotFile(gh); return; }
    if (!cdnUrl) { if (done) done(false); return; }
    cfXhrJson('GET', cdnUrl, null, function (cg, st2, how2) {
      cfFetchStatus.cdn = st2 + (how2 && how2 !== 'xhr' ? '(' + how2 + ')' : '');
      if (cg && typeof cg === 'object') { gotFile(cg); return; }
      cfXhrJson('GET', CF_PROXY_URL, null, function (pg, st3, how3) {
        cfFetchStatus.proxy = st3 + (how3 && how3 !== 'xhr' ? '(' + how3 + ')' : '');
        if (pg && typeof pg === 'object') gotFile(pg); else if (done) done(false);
      });
    });
  });
}

function cfStartSettingsRefresh() {
  cfProbeSameOrigin();
  cfFetchRemoteSettings();
  var mins = Number(cfGet('refreshMinutes')) || 10;
  setInterval(cfFetchRemoteSettings, Math.max(1, mins) * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Hub log: queue what was hidden/blocked and send it every two minutes
// ---------------------------------------------------------------------------
var cfHubQueue = [];
var cfHubLastSend = 0;

function cfHubQueueEntry(entry) {
  if (cfHubQueue.length >= 200) return;
  var kind = entry.reason === 'search' ? 'search' : entry.reason === 'creator' ? 'creator' : 'hidden';
  cfHubQueue.push({
    t: entry.t || Date.now(),
    kind: kind,
    reason: entry.reason || '',
    text: entry.title || '',
    detail: entry.detail || '',
    site: 'youtube-tv',
    creator: entry.reason === 'creator' ? (entry.detail || '') : (entry.creator || ''),
    videoId: entry.videoId || ''
  });
}

function cfHubFlush(force) {
  var hub = cfHub();
  if (!hub) return;
  if (!force && !cfHubQueue.length) return;
  var batch = cfHubQueue.splice(0, 200);
  cfHubLastSend = Date.now();
  cfXhrJson('POST', hub.url + '/log?k=' + encodeURIComponent(hub.key), { device: hub.name, entries: batch }, function (res, status) {
    cfFetchStatus.post = status;
    if (!res && batch.length && cfHubQueue.length < 200) cfHubQueue = batch.concat(cfHubQueue); // retry next time
  });
}

function cfStartHubLog() {
  // heartbeat once settings have had a chance to load, then flush every 2 minutes
  setTimeout(function () { cfHubFlush(true); }, 20000);
  setInterval(function () { cfHubFlush(false); }, 2 * 60 * 1000);
}


// ===== 10-filters.js =====
// ---------------------------------------------------------------------------
// ClearFeed TV: word filters and blocklist matching
// ---------------------------------------------------------------------------

var CF_BUILTIN_WORDS = {
  hateful: [
    'hate', 'hateful', 'racist', 'racism', 'bigot', 'nazi', 'white power', 'supremacist',
    'slur', 'kill all', 'subhuman', 'ethnic cleansing', 'genocide', 'lynch', 'xenophobic',
    'homophobic', 'transphobic', 'misogynist', 'incel', 'go back to your country'
  ],
  materialism: [
    'haul', 'unboxing', 'luxury', 'flexing', 'rich lifestyle', 'millionaire lifestyle',
    'billionaire', 'supercar', 'lambo', 'lamborghini', 'rolex', 'gucci', 'louis vuitton',
    'get rich', 'make money fast', 'passive income', 'dropshipping', 'crypto millionaire', 'forex',
    'giveaway', 'sponsored', 'promo code', 'discount code', 'shopping spree', 'my net worth',
    'most expensive', 'mansion tour', 'car collection'
  ],
  degrading: [
    'humiliation', 'humiliated', 'roast', 'roasting', 'exposed', 'destroyed', 'cringe',
    'fail compilation', 'karen', 'gold digger', 'prank gone wrong', 'thot', 'simp', 'loser',
    'pathetic', 'worthless', 'cancelled', 'canceled', 'diss track', 'clapback', 'slut', 'whore', 'bitch'
  ],
  religious: [
    'sermon', 'bible study', 'quran', 'koran', 'hadith', 'gospel', 'prophecy', 'end times', 'rapture',
    'repent', 'hellfire', 'sinner', 'blasphemy', 'jihad', 'crusade',
    'church service', 'evangelist', 'televangelist', 'miracle healing', 'prosperity gospel',
    'astrology', 'horoscope', 'tarot', 'psychic', 'manifestation'
  ],
  lowMood: [
    // self-harm and hopelessness topics
    'suicide', 'suicidal', 'self harm', 'self-harm', 'selfharm', 'kill myself', 'want to die', 'end it all', 'no reason to live',
    'hopeless', 'nobody cares', "can't go on", 'unalive',
    // doom and outrage
    'catastrophe', 'apocalypse', 'doomsday', 'outrage', 'scandal', 'slammed', 'furious', 'massacre', 'shooting', 'stabbing',
    'terror attack', 'recession', 'layoffs', "you won't believe", "what they don't want you to know",
    // comparison and perfect-life content
    'day in my life', 'glow up', 'transformation', 'my morning routine', 'dream house', 'body goals', 'before and after',
    'weight loss', 'summer body', 'what i eat in a day', 'grindset', 'while you were sleeping',
    // shame-style motivation
    'no excuses', "you're wasting your life", 'stop being weak', 'sigma male', 'alpha male', "if you're not doing this",
    // drama, rage-bait and cruelty
    'called out', 'meltdown', 'public freakout', 'freakout', 'rage bait',
    // dark, violent or disturbing
    'horror', 'gore', 'graphic content', 'disturbing', 'true crime', 'serial killer', 'murder', 'torture', 'jump scare', 'haunted',
    // health scares
    'symptoms of', 'signs you have', 'deadly', "what's wrong with you"
  ]
};

var cfCompiled = {
  byCategory: {},     // category -> RegExp
  allowPhrases: [],   // lowercase phrases to strip before matching
  creators: [],       // lowercase names/handles/ids
  videos: {},         // id -> true
  searches: [],       // lowercase phrases
  trusted: []         // lowercase names/handles/ids
};

function cfEscapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cfNormList(list) {
  var out = [];
  if (!Array.isArray(list)) return out;
  for (var i = 0; i < list.length; i++) {
    var v = String(list[i] || '').trim().toLowerCase();
    if (v) out.push(v);
  }
  return out;
}

function cfNormCreator(v) {
  v = String(v || '').trim().toLowerCase();
  // accept full URLs: youtube.com/@name, youtube.com/channel/UC..., youtube.com/c/name
  var m = v.match(/youtube\.com\/(?:channel\/|c\/|user\/)?@?([^\/?#\s]+)/);
  if (m) v = m[1];
  if (v.charAt(0) === '@') v = v.substring(1);
  return v;
}

function cfNormVideo(v) {
  v = String(v || '').trim();
  var m = v.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return v;
}

function cfCompileFilters() {
  var s = cfSettings;
  if (!s) return;
  var disabled = cfNormList(s.disabledWords);
  var cats = ['hateful', 'materialism', 'degrading', 'religious', 'lowMood'];
  cfCompiled.byCategory = {};
  for (var c = 0; c < cats.length; c++) {
    var cat = cats[c];
    if (!s.categories || !s.categories[cat]) continue;
    var words = cfNormList(CF_BUILTIN_WORDS[cat]).concat(cfNormList(s.extraWords && s.extraWords[cat]));
    var kept = [];
    for (var i = 0; i < words.length; i++) {
      if (disabled.indexOf(words[i]) === -1 && kept.indexOf(words[i]) === -1) kept.push(cfEscapeRe(words[i]));
    }
    if (kept.length) cfCompiled.byCategory[cat] = new RegExp('(^|[^a-z0-9])(' + kept.join('|') + ')(?=$|[^a-z0-9])', 'i');
  }
  cfCompiled.allowPhrases = cfNormList(s.alwaysAllow);
  cfCompiled.creators = [];
  var bc = Array.isArray(s.blockedCreators) ? s.blockedCreators : [];
  for (var j = 0; j < bc.length; j++) { var n = cfNormCreator(bc[j]); if (n) cfCompiled.creators.push(n); }
  cfCompiled.trusted = [];
  var tc = Array.isArray(s.trustedCreators) ? s.trustedCreators : [];
  for (var t = 0; t < tc.length; t++) { var tn = cfNormCreator(tc[t]); if (tn) cfCompiled.trusted.push(tn); }
  cfCompiled.videos = {};
  var bv = Array.isArray(s.blockedVideos) ? s.blockedVideos : [];
  for (var k = 0; k < bv.length; k++) { var id = cfNormVideo(bv[k]); if (id) cfCompiled.videos[id] = true; }
  cfCompiled.searches = cfNormList(s.blockedSearches);
}

// Returns the category name that matched, or null
function cfMatchWords(text) {
  if (!text) return null;
  var t = String(text).toLowerCase();
  for (var a = 0; a < cfCompiled.allowPhrases.length; a++) {
    t = t.split(cfCompiled.allowPhrases[a]).join(' ');
  }
  for (var cat in cfCompiled.byCategory) {
    if (cfCompiled.byCategory[cat].test(t)) return cat;
  }
  return null;
}

// names: array of candidate creator strings (channel name, handle, channel id)
function cfCreatorIn(list, names) {
  for (var i = 0; i < names.length; i++) {
    var n = cfNormCreator(names[i]);
    if (!n) continue;
    for (var j = 0; j < list.length; j++) {
      if (n === list[j]) return true;
    }
  }
  return false;
}

function cfIsBlockedCreator(names) { return cfCreatorIn(cfCompiled.creators, names); }
function cfIsTrustedCreator(names) { return cfCreatorIn(cfCompiled.trusted, names); }
function cfIsBlockedVideo(id) { return !!(id && cfCompiled.videos[id]); }

function cfIsBlockedSearch(query) {
  if (cfGet('blockAllSearches')) return 'all';
  if (!query) return null;
  var q = String(query).toLowerCase();
  for (var i = 0; i < cfCompiled.searches.length; i++) {
    if (q.indexOf(cfCompiled.searches[i]) !== -1) return cfCompiled.searches[i];
  }
  // A search for a blocked creator is refused too
  for (var j = 0; j < cfCompiled.creators.length; j++) {
    if (q.indexOf(cfCompiled.creators[j]) !== -1) return cfCompiled.creators[j];
  }
  return null;
}


// ===== 20-inspect.js =====
// ---------------------------------------------------------------------------
// ClearFeed TV: reading YouTube's data objects
//
// The YouTube TV app is a web page that receives JSON ("innertube" responses).
// Each video in a shelf is a `tileRenderer` (older) or `lockupViewModel`
// (newer). Rather than rely on exact field names, which change, we walk the
// object and collect every piece of text and every identifier we can find.
// ---------------------------------------------------------------------------

var CF_TEXT_KEYS = { simpleText: 1, text: 1, content: 1, label: 1, title: 1, accessibilityLabel: 1 };
var CF_ID_RE = /^(UC[A-Za-z0-9_-]{22}|@[A-Za-z0-9_.-]{3,})$/;

function cfWalk(obj, fn, depth) {
  if (depth > 12 || !obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) cfWalk(obj[i], fn, depth + 1);
    return;
  }
  for (var k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    var v = obj[k];
    if (typeof v === 'string') fn(k, v, obj);
    else if (v && typeof v === 'object') cfWalk(v, fn, depth + 1);
  }
}

// Everything a viewer could read on the tile: title, channel name, badges...
function cfCollectText(item) {
  var parts = [];
  cfWalk(item, function (k, v) {
    if (CF_TEXT_KEYS[k] && v.length < 400 && parts.indexOf(v) === -1) parts.push(v);
  }, 0);
  return parts.join(' \n ');
}

// Channel identifiers: browseIds (UC...), handles (@name) and canonical urls
function cfCollectCreatorIds(item) {
  var ids = [];
  cfWalk(item, function (k, v) {
    if ((k === 'browseId' || k === 'channelId' || k === 'externalChannelId') && v.indexOf('UC') === 0 && ids.indexOf(v) === -1) ids.push(v);
    else if (k === 'canonicalBaseUrl' && v.charAt(0) === '/' && ids.indexOf(v) === -1) ids.push(v.substring(1));
    else if (k === 'url' && /youtube\.com\/(@|channel\/)/.test(v) && ids.indexOf(v) === -1) ids.push(v);
    else if (CF_ID_RE.test(v) && ids.indexOf(v) === -1) ids.push(v);
  }, 0);
  return ids;
}

// Channel *names* as shown on the tile. On TV tiles the channel name is one of
// the metadata lines; we collect short line texts and let the blocklist decide.
function cfCollectLineTexts(item) {
  var lines = [];
  cfWalk(item, function (k, v, parent) {
    if ((k === 'simpleText' || k === 'text' || k === 'content') && v.length <= 80 && lines.indexOf(v) === -1) lines.push(v);
  }, 0);
  return lines;
}

function cfVideoId(item) {
  var id = null;
  cfWalk(item, function (k, v) {
    if (id) return;
    if ((k === 'videoId' || k === 'contentId') && /^[A-Za-z0-9_-]{11}$/.test(v)) id = v;
  }, 0);
  return id;
}

function cfTileTitle(item) {
  try {
    if (item.tileRenderer) return item.tileRenderer.metadata.tileMetadataRenderer.title.simpleText || '';
  } catch (e) { }
  try {
    if (item.lockupViewModel) return item.lockupViewModel.metadata.lockupMetadataViewModel.title.content || '';
  } catch (e) { }
  var t = '';
  cfWalk(item, function (k, v) { if (!t && k === 'simpleText') t = v; }, 0);
  return t;
}

// Is this list entry a video/channel/playlist tile that we should judge?
function cfIsContentItem(item) {
  return !!(item && (item.tileRenderer || item.lockupViewModel || item.videoRenderer ||
    item.gridVideoRenderer || item.compactVideoRenderer || item.channelRenderer || item.gridChannelRenderer));
}

// Decide for one tile: returns {reason, detail} or null
function cfJudgeItem(item) {
  if (!cfIsContentItem(item)) return null;
  var vid = cfVideoId(item);
  var ids = cfCollectCreatorIds(item);
  var lines = cfCollectLineTexts(item);
  var creatorCandidates = ids.concat(lines);

  if (cfIsTrustedCreator(creatorCandidates)) return null;
  if (vid && cfIsBlockedVideo(vid)) return { reason: 'video', detail: vid };
  if (cfIsBlockedCreator(creatorCandidates)) return { reason: 'creator', detail: cfFirstBlockedCreator(creatorCandidates) };
  var cat = cfMatchWords(cfCollectText(item));
  if (cat) return { reason: cat, detail: '' };
  return null;
}

function cfFirstBlockedCreator(names) {
  for (var i = 0; i < names.length; i++) {
    if (cfIsBlockedCreator([names[i]])) return names[i];
  }
  return '';
}


// ===== 30-ui.js =====
// ---------------------------------------------------------------------------
// ClearFeed TV: talking to the YouTube TV app (toasts, modals, commands)
// ---------------------------------------------------------------------------

function cfFindResolver() {
  var yttv = window._yttv;
  if (!yttv) return null;
  for (var key in yttv) {
    var e = yttv[key];
    if (e && e.instance && typeof e.instance.resolveCommand === 'function') return e.instance;
  }
  return null;
}

function cfResolve(cmd) {
  var inst = cfFindResolver();
  if (!inst) return false;
  try { return inst.resolveCommand(cmd, undefined); } catch (e) { return false; }
}

function cfToast(title, subtitle) {
  if (!cfGet('showToasts')) return;
  cfResolve({
    openPopupAction: {
      popupType: 'TOAST',
      popup: {
        overlayToastRenderer: {
          title: { simpleText: title },
          subtitle: { simpleText: subtitle || '' }
        }
      }
    }
  });
}

function cfModal(title, subtitle, message) {
  cfResolve({
    openPopupAction: {
      popupType: 'MODAL',
      uniqueId: 'clearfeed-modal',
      popup: {
        overlaySectionRenderer: {
          overlay: {
            overlayTwoPanelRenderer: {
              actionPanel: {
                overlayPanelRenderer: {
                  header: {
                    overlayPanelHeaderRenderer: {
                      title: { simpleText: title },
                      subtitle: { simpleText: subtitle || '' }
                    }
                  },
                  content: {
                    overlayPanelItemListRenderer: {
                      items: [
                        {
                          compactLinkRenderer: {
                            title: { simpleText: message || '' },
                            subtitle: { simpleText: 'Press back to return' },
                            icon: { iconType: 'INFO' },
                            serviceEndpoint: { signalAction: { signal: 'POPUP_BACK' } }
                          }
                        }
                      ],
                      selectedIndex: 0
                    }
                  }
                }
              },
              backButton: {
                buttonRenderer: {
                  accessibilityData: { accessibilityData: { label: 'Back' } },
                  command: { signalAction: { signal: 'POPUP_BACK' } }
                }
              }
            }
          },
          dismissalCommand: { signalAction: { signal: 'POPUP_BACK' } }
        }
      }
    }
  });
}

function cfSoftReload() {
  cfResolve({ signalAction: { signal: 'SOFT_RELOAD_PAGE' } });
}

// ---------------------------------------------------------------------------
// Hidden-items log, kept on the TV
// ---------------------------------------------------------------------------
var cfSessionHidden = 0;
var cfToastTimer = null;
var cfToastBatch = 0;

function cfLog(entry) {
  cfSessionHidden++;
  try {
    var raw = window.localStorage.getItem(CF_LOG_KEY);
    var log = raw ? JSON.parse(raw) : [];
    entry.t = Date.now();
    try { cfHubQueueEntry(entry); } catch (e2) { }
    log.unshift(entry);
    var max = Number(cfGet('logSize')) || 200;
    if (log.length > max) log.length = max;
    window.localStorage.setItem(CF_LOG_KEY, JSON.stringify(log));
  } catch (e) { }
}

function cfReadLog() {
  try {
    var raw = window.localStorage.getItem(CF_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

// Batch toasts so a page with 30 hidden videos shows one message, not 30
function cfNotifyHidden(n) {
  cfToastBatch += n;
  if (cfToastTimer) return;
  cfToastTimer = setTimeout(function () {
    var count = cfToastBatch;
    cfToastBatch = 0;
    cfToastTimer = null;
    if (count > 0) cfToast('ClearFeed', 'Hidden ' + count + (count === 1 ? ' video' : ' videos'));
  }, 1500);
}

// One line saying where settings came from and whether the hub is reachable
function cfStatusLine() {
  var store = cfReadStore();
  var parts = [];
  if (store.remoteFetchedAt) {
    var mins = Math.round((Date.now() - store.remoteFetchedAt) / 60000);
    var n = (cfGet('blockedCreators') || []).length + (cfGet('blockedSearches') || []).length;
    parts.push('settings ' + mins + ' min ago (' + n + ' blocked channels/searches)');
  } else {
    parts.push('settings: built-in only, GitHub not reached');
  }
  var hub = cfHub();
  if (hub) parts.push('hub: ' + (cfHubLastSend ? 'sent ' + Math.round((Date.now() - cfHubLastSend) / 60000) + ' min ago' : 'not sent yet'));
  else parts.push('no hub');
  parts.push('http gh ' + cfFetchStatus.gh + ' / cdn ' + cfFetchStatus.cdn + ' / proxy ' + cfFetchStatus.proxy + ' / same ' + cfFetchStatus.same + ' / hub ' + cfFetchStatus.hub + ' / post ' + cfFetchStatus.post);
  return parts.join(' · ');
}

// Show the last few hidden items in a modal (opened with the remote's blue button)
function cfShowLogModal() {
  var log = cfReadLog();
  var items = [];
  var n = Math.min(log.length, 12);
  for (var i = 0; i < n; i++) {
    var e = log[i];
    items.push({
      compactLinkRenderer: {
        title: { simpleText: (e.title || e.detail || '(untitled)').substring(0, 70) },
        subtitle: { simpleText: 'Hidden: ' + e.reason + (e.detail && e.reason !== 'video' ? ' (' + e.detail + ')' : '') },
        icon: { iconType: 'VISIBILITY_OFF' },
        serviceEndpoint: { signalAction: { signal: 'POPUP_BACK' } }
      }
    });
  }
  if (!items.length) {
    items.push({
      compactLinkRenderer: {
        title: { simpleText: 'Nothing hidden yet' },
        icon: { iconType: 'CHECK' },
        serviceEndpoint: { signalAction: { signal: 'POPUP_BACK' } }
      }
    });
  }
  cfResolve({
    openPopupAction: {
      popupType: 'MODAL',
      uniqueId: 'clearfeed-log',
      popup: {
        overlaySectionRenderer: {
          overlay: {
            overlayTwoPanelRenderer: {
              actionPanel: {
                overlayPanelRenderer: {
                  header: {
                    overlayPanelHeaderRenderer: {
                      title: { simpleText: 'ClearFeed v' + CF_VERSION },
                      subtitle: { simpleText: log.length + ' hidden in total, ' + cfSessionHidden + ' this session · ' + cfStatusLine() }
                    }
                  },
                  content: { overlayPanelItemListRenderer: { items: items, selectedIndex: 0 } }
                }
              },
              backButton: {
                buttonRenderer: {
                  accessibilityData: { accessibilityData: { label: 'Back' } },
                  command: { signalAction: { signal: 'POPUP_BACK' } }
                }
              }
            }
          },
          dismissalCommand: { signalAction: { signal: 'POPUP_BACK' } }
        }
      }
    }
  });
}


// ===== 40-hooks.js =====
// ---------------------------------------------------------------------------
// ClearFeed TV: the hooks
//   1. JSON.parse  — every response the app receives passes through here
//   2. fetch / XHR — search requests are checked before they leave the TV
//   3. resolveCommand — navigation to blocked videos/channels/searches is refused
// ---------------------------------------------------------------------------

var CF_SHORTS_KEYS = { reelShelfRenderer: 1, shortsLockupViewModel: 1, reelItemRenderer: 1 };

function cfIsShortsEntry(item) {
  if (!item || typeof item !== 'object') return false;
  for (var k in CF_SHORTS_KEYS) if (item[k]) return true;
  // Shelf whose title is "Shorts"
  try {
    var t = item.shelfRenderer.shelfHeaderRenderer.title.simpleText;
    if (t && /^shorts$/i.test(t.trim())) return true;
  } catch (e) { }
  try {
    var t2 = item.shelfRenderer.headerRenderer.shelfHeaderRenderer.title.simpleText;
    if (t2 && /^shorts$/i.test(t2.trim())) return true;
  } catch (e) { }
  return false;
}

function cfIsEmptyShelf(item) {
  try {
    var hl = item.shelfRenderer.content.horizontalListRenderer;
    if (hl && Array.isArray(hl.items) && hl.items.length === 0) return true;
  } catch (e) { }
  try {
    var gr = item.shelfRenderer.content.gridRenderer;
    if (gr && Array.isArray(gr.items) && gr.items.length === 0) return true;
  } catch (e) { }
  return false;
}

// Filter one array of entries in place. Returns number removed.
function cfFilterArray(arr) {
  var removed = 0;
  var hideShorts = cfGet('hideShorts');
  var i = 0;
  while (i < arr.length) {
    var item = arr[i];
    var drop = false;
    if (hideShorts && cfIsShortsEntry(item)) {
      drop = true;
      cfLog({ reason: 'shorts', detail: '', title: 'Shorts shelf' });
    } else if (cfIsContentItem(item)) {
      var verdict = cfJudgeItem(item);
      if (verdict) {
        drop = true;
        cfLog({ reason: verdict.reason, detail: verdict.detail, title: cfTileTitle(item), videoId: cfVideoId(item) });
      }
    }
    if (drop) { arr.splice(i, 1); removed++; }
    else i++;
  }
  return removed;
}

// Walk the whole response; filter any array that contains content items,
// then drop shelves left empty.
function cfFilterResponse(root) {
  var removed = 0;
  function visit(node, depth) {
    if (depth > 24 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      var hasContent = false;
      for (var i = 0; i < node.length; i++) {
        if (cfIsContentItem(node[i]) || cfIsShortsEntry(node[i])) { hasContent = true; break; }
      }
      if (hasContent) removed += cfFilterArray(node);
      for (var j = 0; j < node.length; j++) visit(node[j], depth + 1);
      // after children are filtered, drop empty shelves
      var k = 0;
      while (k < node.length) {
        if (cfIsEmptyShelf(node[k])) node.splice(k, 1); else k++;
      }
      return;
    }
    for (var key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
      var v = node[key];
      if (v && typeof v === 'object') visit(v, depth + 1);
    }
  }
  visit(root, 0);
  return removed;
}

// Player response for a single video (watch page / autoplay / up-next)
function cfCheckPlayerResponse(r) {
  var vd = r.videoDetails;
  if (!vd || typeof vd !== 'object') return false;
  var names = [vd.author || '', vd.channelId || ''];
  if (cfIsTrustedCreator(names)) return false;
  var reason = null, detail = '';
  if (vd.videoId && cfIsBlockedVideo(vd.videoId)) { reason = 'video'; detail = vd.videoId; }
  else if (cfIsBlockedCreator(names)) { reason = 'creator'; detail = vd.author || vd.channelId; }
  else {
    var cat = cfMatchWords((vd.title || '') + ' \n ' + (vd.author || '') + ' \n ' + (vd.shortDescription || '').substring(0, 500) + ' \n ' + (vd.keywords ? vd.keywords.join(' ') : ''));
    if (cat) reason = cat;
  }
  if (!reason) return false;
  r.playabilityStatus = {
    status: 'ERROR',
    reason: 'ClearFeed: this video is blocked',
    errorScreen: {
      playerErrorMessageRenderer: {
        reason: { simpleText: 'ClearFeed: this video is blocked' },
        subreason: { simpleText: 'Reason: ' + reason + (detail ? ' (' + detail + ')' : '') }
      }
    }
  };
  delete r.streamingData;
  delete r.adPlacements;
  delete r.playerAds;
  delete r.adSlots;
  cfLog({ reason: reason, detail: detail, title: vd.title || '', videoId: vd.videoId || '' });
  cfToast('ClearFeed', 'Video blocked: ' + reason);
  return true;
}

// Browse response for a channel page
function cfCheckChannelResponse(r) {
  var meta = r.metadata && r.metadata.channelMetadataRenderer;
  var header = r.header || {};
  var ids = cfCollectCreatorIds({ metadata: r.metadata, header: header });
  var title = '';
  if (meta && meta.title) title = meta.title;
  else {
    cfWalk(header, function (k, v) { if (!title && (k === 'title' || k === 'simpleText')) title = v; }, 0);
  }
  if (!meta && !ids.length) return false;
  var names = ids.concat(title ? [title] : []);
  if (cfIsTrustedCreator(names)) return false;
  if (!cfIsBlockedCreator(names)) return false;
  r.contents = { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { content: { sectionListRenderer: { contents: [] } } } } } };
  if (r.header) r.header = {};
  cfLog({ reason: 'creator', detail: title || ids[0], title: 'Channel page: ' + (title || ids[0]) });
  setTimeout(function () { cfModal('ClearFeed', 'Channel blocked', (title || 'This channel') + ' is on your blocked list'); }, 50);
  return true;
}

var cfOrigParse = JSON.parse;
function cfInstallParseHook() {
  JSON.parse = function () {
    var r = cfOrigParse.apply(this, arguments);
    try {
      if (r && typeof r === 'object') {
        if (r.videoDetails && r.playabilityStatus) {
          cfCheckPlayerResponse(r);
        } else if (r.metadata || r.header) {
          cfCheckChannelResponse(r);
        }
        var removed = cfFilterResponse(r);
        if (removed > 0) cfNotifyHidden(removed);
      }
    } catch (e) { }
    return r;
  };
}

// --- Search requests -------------------------------------------------------

function cfBlockedSearchResponse(query, why) {
  return {
    contents: {
      sectionListRenderer: {
        contents: [{
          itemSectionRenderer: {
            contents: [{
              messageRenderer: {
                text: { simpleText: 'ClearFeed: this search is blocked' },
                style: 'MESSAGE_STYLE_DEFAULT'
              }
            }]
          }
        }]
      }
    },
    estimatedResults: '0',
    clearfeedBlocked: true
  };
}

function cfQueryFromBody(body) {
  try {
    if (!body) return null;
    var obj = typeof body === 'string' ? cfOrigParse(body) : body;
    return obj && typeof obj.query === 'string' ? obj.query : null;
  } catch (e) { return null; }
}

function cfHandleBlockedSearch(query, why) {
  cfLog({ reason: 'search', detail: why === 'all' ? 'all searches off' : why, title: 'Search: ' + query });
  setTimeout(function () {
    cfModal('ClearFeed', 'Search blocked', why === 'all' ? 'Searching is switched off on this TV' : 'That search contains a blocked word');
  }, 50);
}

function cfIsSearchUrl(url) {
  return typeof url === 'string' && url.indexOf('/youtubei/v1/search') !== -1;
}

function cfInstallFetchHook() {
  if (typeof window.fetch !== 'function') return;
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url);
      if (cfIsSearchUrl(url)) {
        var q = cfQueryFromBody(init && init.body);
        var why = cfIsBlockedSearch(q);
        if (why) {
          cfHandleBlockedSearch(q, why);
          var body = JSON.stringify(cfBlockedSearchResponse(q, why));
          if (typeof Response === 'function') {
            return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
          }
          return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(cfOrigParse(body)); }, text: function () { return Promise.resolve(body); } });
        }
      }
    } catch (e) { }
    return origFetch.apply(this, arguments);
  };
}

function cfInstallXhrHook() {
  if (typeof XMLHttpRequest === 'undefined') return;
  var proto = XMLHttpRequest.prototype;
  var origOpen = proto.open;
  var origSend = proto.send;
  proto.open = function (method, url) {
    this.__cfUrl = url;
    return origOpen.apply(this, arguments);
  };
  proto.send = function (body) {
    try {
      if (cfIsSearchUrl(this.__cfUrl)) {
        var q = cfQueryFromBody(body);
        var why = cfIsBlockedSearch(q);
        if (why) {
          cfHandleBlockedSearch(q, why);
          var xhr = this;
          var text = JSON.stringify(cfBlockedSearchResponse(q, why));
          var define = function (name, value) {
            try { Object.defineProperty(xhr, name, { configurable: true, get: function () { return value; } }); } catch (e) { }
          };
          define('readyState', 4);
          define('status', 200);
          define('statusText', 'OK');
          define('responseText', text);
          define('response', xhr.responseType === 'json' ? cfOrigParse(text) : text);
          define('responseURL', xhr.__cfUrl);
          xhr.getResponseHeader = function (h) { return /content-type/i.test(h) ? 'application/json' : null; };
          xhr.getAllResponseHeaders = function () { return 'content-type: application/json\r\n'; };
          setTimeout(function () {
            var ev = { type: 'readystatechange', target: xhr };
            try { if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange(ev); } catch (e) { }
            try { if (typeof xhr.onload === 'function') xhr.onload({ type: 'load', target: xhr }); } catch (e) { }
            try { if (typeof xhr.onloadend === 'function') xhr.onloadend({ type: 'loadend', target: xhr }); } catch (e) { }
            try {
              if (typeof Event === 'function' && typeof xhr.dispatchEvent === 'function') {
                xhr.dispatchEvent(new Event('readystatechange'));
                xhr.dispatchEvent(new Event('load'));
                xhr.dispatchEvent(new Event('loadend'));
              }
            } catch (e) { }
          }, 0);
          return;
        }
      }
    } catch (e) { }
    return origSend.apply(this, arguments);
  };
}

// --- Navigation commands ----------------------------------------------------

var cfResolverPatched = false;
function cfPatchResolveCommand() {
  if (cfResolverPatched) return true;
  var inst = cfFindResolver();
  if (!inst) return false;
  var orig = inst.resolveCommand;
  inst.resolveCommand = function (cmd, extra) {
    try {
      var blocked = cfCommandBlocked(cmd);
      if (blocked) {
        setTimeout(function () { cfModal('ClearFeed', blocked.title, blocked.message); }, 0);
        return true;
      }
    } catch (e) { }
    return orig.apply(this, arguments);
  };
  cfResolverPatched = true;
  return true;
}

function cfCommandBlocked(cmd) {
  if (!cmd || typeof cmd !== 'object') return null;
  var se = cmd.searchEndpoint;
  if (se && typeof se.query === 'string') {
    var why = cfIsBlockedSearch(se.query);
    if (why) {
      cfLog({ reason: 'search', detail: why === 'all' ? 'all searches off' : why, title: 'Search: ' + se.query });
      return { title: 'Search blocked', message: why === 'all' ? 'Searching is switched off on this TV' : 'That search contains a blocked word' };
    }
  }
  var we = cmd.watchEndpoint || (cmd.reelWatchEndpoint);
  if (we && we.videoId && cfIsBlockedVideo(we.videoId)) {
    cfLog({ reason: 'video', detail: we.videoId, title: 'Video ' + we.videoId });
    return { title: 'Video blocked', message: 'This video is on your blocked list' };
  }
  var be = cmd.browseEndpoint;
  if (be && be.browseId) {
    var names = [be.browseId];
    if (be.canonicalBaseUrl) names.push(be.canonicalBaseUrl.substring(1));
    if (cfIsBlockedCreator(names)) {
      cfLog({ reason: 'creator', detail: names[names.length - 1], title: 'Channel ' + names[names.length - 1] });
      return { title: 'Channel blocked', message: 'This channel is on your blocked list' };
    }
  }
  // Commands can wrap other commands
  var inner = cmd.commandExecutorCommand && cmd.commandExecutorCommand.commands;
  if (Array.isArray(inner)) {
    for (var i = 0; i < inner.length; i++) {
      var b = cfCommandBlocked(inner[i]);
      if (b) return b;
    }
  }
  if (cmd.signalAction && cmd.signalAction.customAction) return null;
  return null;
}


// ===== 90-main.js =====
// ---------------------------------------------------------------------------
// ClearFeed TV: start-up
// ---------------------------------------------------------------------------

function cfOnKey(ev) {
  // Blue button on Samsung remotes (keyCode 406) opens the hidden-items log
  if (ev && (ev.keyCode === 406 || ev.key === 'ColorF3Blue')) {
    ev.preventDefault();
    ev.stopPropagation();
    cfShowLogModal();
    return false;
  }
  return true;
}

function cfStart() {
  if (window.__clearfeedTV) return;
  window.__clearfeedTV = { version: CF_VERSION, log: cfReadLog, settings: function () { return cfSettings; }, flush: function () { cfHubFlush(true); }, status: cfStatusLine };

  cfRebuildSettings();
  cfInstallParseHook();
  cfInstallFetchHook();
  cfInstallXhrHook();
  cfStartSettingsRefresh();
  cfStartHubLog();

  try { document.addEventListener('keydown', cfOnKey, true); } catch (e) { }

  // Wait for the YouTube app to finish booting, then patch its command
  // resolver and reload the home feed so the first screen is filtered too.
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (cfPatchResolveCommand()) {
      clearInterval(timer);
      setTimeout(function () {
        cfSoftReload();
        cfToast('ClearFeed is on', 'Blue button shows what was hidden');
      }, 1500);
    } else if (tries > 300) {
      clearInterval(timer);
    }
  }, 200);
}

cfStart();


})();
