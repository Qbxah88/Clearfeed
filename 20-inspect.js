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
