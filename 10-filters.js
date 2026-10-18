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
  var cats = ['hateful', 'materialism', 'degrading', 'religious'];
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
