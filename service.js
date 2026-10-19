// ClearFeed TV relay service. Runs inside TizenBrew's Node service on the TV
// (started because package.json names it in "serviceFile").
//
// The YouTube TV page refuses to make requests to outside addresses, but it
// may talk to 127.0.0.1. This relay forwards the page's requests to the few
// hosts ClearFeed needs: the settings file on GitHub/jsDelivr and the hub.
//
// Written for very old Node (4.x): no arrow functions, no let/const at top level.
var http = require('http');
var https = require('https');
var urlMod = require('url');

var PORT = 8766;
var VERSION = '1.0.0';

function allowedHost(h) {
  if (!h) return false;
  if (h === 'raw.githubusercontent.com' || h === 'cdn.jsdelivr.net') return true;
  if (/\.workers\.dev$/.test(h)) return true;
  return false;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-cf-key');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, status, obj) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function forward(req, res, targetUrl, body, insecure) {
  var t = urlMod.parse(targetUrl);
  var opts = {
    hostname: t.hostname,
    port: 443,
    path: t.path,
    method: req.method,
    headers: {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'User-Agent': 'ClearFeed-TV-relay/' + VERSION,
      'Accept': 'application/json, text/plain, */*'
    }
  };
  if (req.headers['x-cf-key']) opts.headers['x-cf-key'] = req.headers['x-cf-key'];
  if (body && body.length) opts.headers['Content-Length'] = body.length;
  if (insecure) opts.rejectUnauthorized = false;
  var r = https.request(opts, function (pr) {
    var chunks = [];
    pr.on('data', function (c) { chunks.push(c); });
    pr.on('end', function () {
      cors(res);
      var h = { 'Content-Type': pr.headers['content-type'] || 'application/json' };
      if (insecure) h['X-CF-Insecure'] = '1';
      res.writeHead(pr.statusCode, h);
      res.end(Buffer.concat(chunks));
    });
  });
  r.on('error', function (e) {
    var msg = String(e && e.message || e);
    // Old TVs have an old certificate store; retry once without verification
    // rather than leave the family with no settings at all.
    if (!insecure && /CERT|certificate|SSL|unable to verify|self signed/i.test(msg)) {
      forward(req, res, targetUrl, body, true);
      return;
    }
    sendJson(res, 502, { error: msg });
  });
  if (body && body.length) r.write(body);
  r.end();
}

var server = http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }
  var q = urlMod.parse(req.url, true);
  if (q.pathname === '/health') { sendJson(res, 200, { ok: true, service: 'clearfeed-relay', version: VERSION, node: process.version }); return; }
  if (q.pathname !== '/relay' || !q.query || !q.query.url) { sendJson(res, 404, { error: 'use /relay?url=https://...' }); return; }
  var target = urlMod.parse(String(q.query.url));
  if (target.protocol !== 'https:' || !allowedHost(target.hostname)) { sendJson(res, 403, { error: 'host not allowed' }); return; }
  var chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () { forward(req, res, String(q.query.url), Buffer.concat(chunks), false); });
});

server.on('error', function (e) {
  // Port busy (service already running from an earlier launch): nothing to do.
});
server.listen(PORT, '127.0.0.1');
