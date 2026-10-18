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
