// Runs dist/userScript.js inside a fake YouTube-TV-like window and checks
// what gets hidden, blocked and logged. No browser needed.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')); }
}

// ---- fake browser -----------------------------------------------------------
function makeWindow(remoteSettings) {
  const store = {};
  const commands = [];
  const win = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    location: { hash: '#/', hostname: 'www.youtube.com' },
    _yttv: { a: { instance: { resolveCommand: (cmd) => { commands.push(cmd); return 'orig'; } } } },
    commands,
    xhrLog: [],
    setTimeout, clearTimeout, setInterval, clearInterval,
    console
  };
  win.window = win;
  win.document = { addEventListener: () => { } };
  // XHR fake: settings fetch returns remoteSettings; search requests are recorded
  function XHR() { this.headers = {}; }
  XHR.prototype.open = function (m, url) { this.url = url; };
  XHR.prototype.setRequestHeader = function () { };
  XHR.prototype.send = function (body) {
    const self = this;
    win.xhrLog.push({ url: this.url, body });
    setTimeout(() => {
      if (self.url.indexOf('settings.json') !== -1) {
        self.readyState = 4; self.status = 200; self.responseText = JSON.stringify(remoteSettings);
      } else {
        self.readyState = 4; self.status = 200; self.responseText = '{"real":true}';
      }
      if (self.onreadystatechange) self.onreadystatechange();
      if (self.onload) self.onload();
    }, 0);
  };
  win.XMLHttpRequest = XHR;
  win.Event = function (t) { this.type = t; };
  return win;
}

const script = fs.readFileSync(path.join(__dirname, '..', 'dist', 'userScript.js'), 'utf8');

function boot(remoteSettings) {
  const win = makeWindow(remoteSettings);
  // point the module at a settings URL (the default is a CHANGE-ME placeholder)
  win.localStorage.setItem('clearfeed-tv', JSON.stringify({ local: { settingsUrl: 'https://example.test/settings.json' } }));
  const ctx = vm.createContext(win);
  vm.runInContext(script, ctx);
  return { win, ctx };
}

// ---- realistic YouTube TV fixtures ------------------------------------------
function tile(videoId, title, channel, channelId) {
  return {
    tileRenderer: {
      contentType: 'TILE_CONTENT_TYPE_VIDEO',
      contentId: videoId,
      header: { tileHeaderRenderer: { thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/' + videoId + '/hq.jpg' }] } } },
      metadata: {
        tileMetadataRenderer: {
          title: { simpleText: title },
          lines: [
            { lineRenderer: { items: [{ lineItemRenderer: { text: { simpleText: channel }, navigationEndpoint: { browseEndpoint: { browseId: channelId, canonicalBaseUrl: '/@' + channel.replace(/\s+/g, '') } } } }] } },
            { lineRenderer: { items: [{ lineItemRenderer: { text: { simpleText: '1.2M views' } } }, { lineItemRenderer: { text: { simpleText: '3 days ago' } } }] } }
          ]
        }
      },
      onSelectCommand: { watchEndpoint: { videoId: videoId } }
    }
  };
}
function lockup(videoId, title, channel) {
  return {
    lockupViewModel: {
      contentId: videoId,
      contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
      metadata: { lockupMetadataViewModel: { title: { content: title }, metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: channel } }] }] } } } },
      rendererContext: { commandContext: { onTap: { innertubeCommand: { watchEndpoint: { videoId } } } } }
    }
  };
}
function shelf(title, items) {
  return { shelfRenderer: { shelfHeaderRenderer: { title: { simpleText: title } }, content: { horizontalListRenderer: { items } } } };
}
function home(shelves) {
  return { contents: { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { content: { sectionListRenderer: { contents: shelves } } } } } } };
}

const SETTINGS = {
  blockedCreators: ['https://www.youtube.com/@MrFlexTV', 'UCblockedchannel00000001', 'Drama Central'],
  blockedVideos: ['https://youtu.be/BLOCKEDVID1', 'BLOCKEDVID2'],
  blockedSearches: ['prank', 'free robux'],
  trustedCreators: ['Kurzgesagt'],
  extraWords: { materialism: ['shein'] },
  disabledWords: ['haul'],
  alwaysAllow: ['book haul'],
  hideShorts: true
};

async function main() {
  console.log('Booting module with remote settings...');
  const { win, ctx } = boot(SETTINGS);
  await new Promise(r => setTimeout(r, 350)); // let the settings XHR land and the resolver patch run
  const CF = win.__clearfeedTV;
  check('module exposes version', CF && CF.version === '1.0.0');
  check('remote settings merged', CF.settings().blockedSearches.indexOf('prank') !== -1);
  check('defaults kept alongside remote', CF.settings().categories.religious === true);

  // The hooks replaced JSON.parse inside the sandbox
  const parse = vm.runInContext('JSON.parse', ctx);
  check('JSON.parse is hooked', parse !== JSON.parse);

  console.log('\nHome feed:');
  const feed = home([
    shelf('Recommended', [
      tile('okvideo0001', 'How volcanoes work', 'Science Hub', 'UCsciencehub000000000001'),
      tile('okvideo0002', 'My SHEIN summer haul', 'Fashion Girl', 'UCfashion000000000000001'),      // extra word shein
      tile('okvideo0003', 'Huge book haul from the library', 'Bookish', 'UCbookish000000000000001'), // haul disabled + allowed phrase
      tile('okvideo0004', 'I bought a Lamborghini at 19', 'MrFlexTV', 'UCmrflex0000000000000001'),  // creator blocked by handle
      tile('BLOCKEDVID1', 'Perfectly normal title', 'Nice Channel', 'UCnice000000000000000001'),    // blocked video id
      tile('okvideo0005', 'Weekly sermon: repent now', 'Some Church', 'UCchurch0000000000000001'),   // religious
      tile('okvideo0006', 'This is a Lamborghini unboxing', 'Kurzgesagt', 'UCkurz000000000000000001'), // trusted wins
      lockup('okvideo0007', 'Exposed: the biggest gold digger prank', 'Drama Central'),             // creator by name
      lockup('okvideo0008', 'Learning Python in 10 minutes', 'Code School')
    ]),
    shelf('Shorts', [tile('short000001', 'Funny cat', 'Cats', 'UCcats000000000000000001')]),
    shelf('Only bad', [tile('okvideo0009', 'ROLEX collection tour', 'Watch Guy', 'UCwatch00000000000000001')])
  ]);
  const out = parse(JSON.stringify(feed));
  const shelves = out.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents;
  const titles = shelves[0].shelfRenderer.content.horizontalListRenderer.items.map(i => i.tileRenderer ? i.tileRenderer.metadata.tileMetadataRenderer.title.simpleText : i.lockupViewModel.metadata.lockupMetadataViewModel.title.content);
  check('clean video kept', titles.indexOf('How volcanoes work') !== -1);
  check('extra word (shein) hidden', titles.indexOf('My SHEIN summer haul') === -1);
  check('disabled word + allow phrase kept', titles.indexOf('Huge book haul from the library') !== -1, titles.join(' | '));
  check('blocked creator by @handle hidden', titles.indexOf('I bought a Lamborghini at 19') === -1);
  check('blocked video id hidden despite clean title', titles.indexOf('Perfectly normal title') === -1);
  check('religious word hidden', titles.indexOf('Weekly sermon: repent now') === -1);
  check('trusted creator never hidden', titles.indexOf('This is a Lamborghini unboxing') !== -1);
  check('lockupViewModel blocked creator by name hidden', titles.indexOf('Exposed: the biggest gold digger prank') === -1);
  check('lockupViewModel clean kept', titles.indexOf('Learning Python in 10 minutes') !== -1);
  check('Shorts shelf removed', shelves.length === 1, 'shelves left: ' + shelves.map(s => s.shelfRenderer.shelfHeaderRenderer.title.simpleText).join(','));
  check('shelf emptied by filtering removed', !shelves.some(s => s.shelfRenderer.shelfHeaderRenderer.title.simpleText === 'Only bad'));

  console.log('\nContinuation (scrolling down):');
  const cont = parse(JSON.stringify({ continuationContents: { horizontalListContinuation: { items: [tile('okvideo0010', 'Chess opening basics', 'Chess Club', 'UCchess00000000000000001'), tile('okvideo0011', 'Get rich with passive income', 'Guru', 'UCguru000000000000000001')] } } }));
  check('continuation filtered', cont.continuationContents.horizontalListContinuation.items.length === 1);

  console.log('\nSearch results page (response side):');
  const sr = parse(JSON.stringify({ contents: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: [tile('okvideo0012', 'Crusade documentary', 'History', 'UChistory000000000000001'), tile('okvideo0013', 'Bread recipe', 'Baker', 'UCbaker00000000000000001')] } }] } } }));
  check('search results filtered by words', sr.contents.sectionListRenderer.contents[0].itemSectionRenderer.contents.length === 1);

  console.log('\nPlayer response (opening a video directly):');
  const pr = parse(JSON.stringify({ videoDetails: { videoId: 'BLOCKEDVID2', title: 'Fine title', author: 'Someone', channelId: 'UCx' }, playabilityStatus: { status: 'OK' }, streamingData: { formats: [1] } }));
  check('blocked video id cannot play', pr.playabilityStatus.status === 'ERROR' && !pr.streamingData);
  const pr2 = parse(JSON.stringify({ videoDetails: { videoId: 'okvideo0014', title: 'Fine title', author: 'Anyone', channelId: 'UCblockedchannel00000001' }, playabilityStatus: { status: 'OK' }, streamingData: {} }));
  check('blocked channel id cannot play', pr2.playabilityStatus.status === 'ERROR');
  const pr3 = parse(JSON.stringify({ videoDetails: { videoId: 'okvideo0015', title: 'Fine title', author: 'Anyone', channelId: 'UCfine' }, playabilityStatus: { status: 'OK' }, streamingData: { x: 1 } }));
  check('clean video plays', pr3.playabilityStatus.status === 'OK' && pr3.streamingData);

  console.log('\nChannel page:');
  const ch = parse(JSON.stringify({ metadata: { channelMetadataRenderer: { title: 'Drama Central', externalId: 'UCdrama000000000000000001' } }, header: { c4TabbedHeaderRenderer: { title: 'Drama Central', channelId: 'UCdrama000000000000000001' } }, contents: { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { content: { sectionListRenderer: { contents: [shelf('Videos', [tile('v1', 'x', 'Drama Central', 'UCdrama000000000000000001')])] } } } } } } }));
  check('blocked channel page emptied', ch.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents.length === 0);
  const ch2 = parse(JSON.stringify({ metadata: { channelMetadataRenderer: { title: 'Science Hub', externalId: 'UCsciencehub000000000001' } }, contents: { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { content: { sectionListRenderer: { contents: [shelf('Videos', [tile('v2', 'Stars', 'Science Hub', 'UCsciencehub000000000001')])] } } } } } } }));
  check('allowed channel page untouched', ch2.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents.length === 1);

  console.log('\nSearch requests (XHR):');
  const XHR = vm.runInContext('XMLHttpRequest', ctx);
  function searchXhr(query) {
    return new Promise(resolve => {
      const x = new XHR();
      x.open('POST', 'https://www.youtube.com/youtubei/v1/search?key=abc');
      x.onreadystatechange = () => { if (x.readyState === 4) resolve(JSON.parse(x.responseText)); };
      x.send(JSON.stringify({ context: {}, query }));
    });
  }
  const s1 = await searchXhr('best PRANK on my sister');
  check('blocked word search refused (fake empty response)', s1.clearfeedBlocked === true);
  check('refused search never reached the network', !win.xhrLog.some(l => l.url.indexOf('/search') !== -1 && l.body && l.body.indexOf('PRANK') !== -1));
  const s2 = await searchXhr('mrflextv latest');
  check('search for a blocked creator refused', s2.clearfeedBlocked === true);
  const s3 = await searchXhr('how to bake bread');
  check('normal search goes through', s3.real === true);

  console.log('\nNavigation commands:');
  const inst = win._yttv.a.instance;
  const r1 = inst.resolveCommand({ searchEndpoint: { query: 'free robux generator' } });
  check('searchEndpoint with blocked phrase swallowed', r1 === true);
  const r2 = inst.resolveCommand({ watchEndpoint: { videoId: 'BLOCKEDVID1' } });
  check('watchEndpoint for blocked video swallowed', r2 === true);
  const r3 = inst.resolveCommand({ browseEndpoint: { browseId: 'UCblockedchannel00000001' } });
  check('browseEndpoint for blocked channel swallowed', r3 === true);
  const r4 = inst.resolveCommand({ watchEndpoint: { videoId: 'okvideo0001' } });
  check('normal command passes to YouTube', r4 === 'orig');
  await new Promise(r => setTimeout(r, 10));
  check('a blocking modal was shown', win.commands.some(c => c.openPopupAction && c.openPopupAction.popupType === 'MODAL'));

  console.log('\nLog:');
  const log = CF.log();
  check('log has entries', log.length > 10, 'entries: ' + log.length);
  check('log records reasons', log.some(e => e.reason === 'search') && log.some(e => e.reason === 'creator') && log.some(e => e.reason === 'video'));
  check('log records titles', log.some(e => e.title === 'My SHEIN summer haul'));

  console.log('\nBlock-all-searches mode:');
  const b = boot(Object.assign({}, SETTINGS, { blockAllSearches: true }));
  await new Promise(r => setTimeout(r, 350));
  const bInst = b.win._yttv.a.instance;
  check('every search refused', bInst.resolveCommand({ searchEndpoint: { query: 'cats' } }) === true);

  console.log('\nOffline start (no remote settings):');
  const off = makeWindow(null);
  off.XMLHttpRequest = function () { this.open = () => { }; this.send = () => { throw new Error('offline'); }; };
  vm.runInContext(script, vm.createContext(off));
  check('module still boots with defaults', off.__clearfeedTV && off.__clearfeedTV.settings().categories.hateful === true);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
